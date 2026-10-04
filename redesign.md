# FocusedContext redesign: plan and Claude Code prompts

Design: https://claude.ai/artifact/1PpEY7T6fXGy4jsHkSLC6F (3 screens: My Notes, Edit note, Settings).
Checked against the code on `main` at e453bd7 (2026-10-04).

## What changes, in plain words

- **Look:** soft green-grey background, white rounded cards, one dark green accent, pill-shaped chips, two new fonts (Bricolage Grotesque for big titles, Figtree for everything else).
- **Notes list:** notes are grouped under headings (Today, Tomorrow · Mon 5 Oct, Smart alerts) with the alarm time on the right, and a small "At Home" chip at the top shows where the app thinks you are.
- **Edit note:** everything sits in cards: the note text, a "Phone alert" card (switch + Date + Time + "Reset to Smart"), Category chips, Place chips.
- **Settings:** cards for Where you are now, Saved places (each with a ⋯ menu), Phone notifications, and who you are signed in as.
- **Nothing on the server changes.** No backend deploy is needed.

## Things the design leaves out that we keep

The design is a mockup, so a few existing features are not drawn. The prompts keep them in the new style:
- **Your category colors** (Settings). Each note's small icon square uses your color, with black or white icon by contrast, exactly like today's badges.
- **Folder (list) picker** when editing a note. It becomes a "Folder" card with chips, like Category and Place.
- **Use current location / Search address / Forget** for places. They move into the "Set location" button and the ⋯ menu.
- **Each place's saved address** (or "Set from current location" / "No location set") stays as the grey line under its name.
- **Swipe to delete a note** and **long-press a folder chip to delete it.**
- **"Alerts off" notes** get their own section at the bottom of the list.

## Right-to-left (Hebrew phone)

Your phone's language is Hebrew, so Android mirrors the app today (titles on the right, back arrow flipped). The design and all app text are English, so the plan **turns the mirroring off** and the app looks exactly like the design. Hebrew note text still reads correctly inside its line. If you'd rather keep the mirrored layout, skip that part of step 1.

## How to run the steps

Do them one at a time, in order. After each step: Claude Code runs `npm test` and `npx tsc --noEmit` from `mobile/`, then commits. Check it in Expo Go or a debug build if you like, but the real phone check is step 7.

---

### Step 0: start a branch

```
In the repo, run `git checkout main && git pull`, then create and switch to a new branch `redesign`. All the redesign steps will be committed on this branch. Don't change any code yet.
```

### Step 1: theme, fonts, and left-to-right layout

```
We're redesigning the mobile app (mobile/, Expo SDK 54, RN 0.81). This first step only adds the design foundation; screens come later.

1. Create mobile/src/theme.ts exporting these tokens:
   colors: background #F3F5F0, surface #FFFFFF, border #E1E6DE, text #17211B, textMuted #56635B,
           primary #1F7A3A (filled buttons, selected chips, switches), onPrimary #FFFFFF,
           primaryDark #145C2A (green text/icons on light green), primarySoft #DCEEDD (light green fills),
           chip #E6EAE2 (unselected chip fill), danger #B3261E.
   radius: card 20, noteCard 16, chip 22 (pill), iconTile 12, fab 18.
   spacing: screen side padding 16, gap between cards 12, gap between note cards 8.
   fonts: display "BricolageGrotesque_700Bold", body "Figtree_400Regular", bodyMedium "Figtree_500Medium",
          bodySemi "Figtree_600SemiBold", bodyBold "Figtree_700Bold".
   type presets: screenTitle 28/44 display; sectionLabel 13/18 bodyBold uppercase, letterSpacing 0.8, textMuted;
          cardTitle 16/22 bodyBold; body 16/22 bodySemi; caption 13/18 body textMuted; chip 14 bodySemi.
   Minimum touch target 44.
2. Install fonts with `npx expo install expo-font @expo-google-fonts/figtree @expo-google-fonts/bricolage-grotesque`
   (use npx expo install, never npm audit fix). In App.tsx load them with useFonts and keep showing the
   existing loading spinner until they're loaded.
3. Turn off right-to-left mirroring: the phone's language is Hebrew, but the UI is English and the design is
   left-to-right. Use the correct method for Expo SDK 54 (check the docs: the expo-localization config plugin
   option or app.json setting for supportsRTL / forcesRTL), and also call I18nManager.allowRTL(false) and
   I18nManager.forceRTL(false) at startup as a fallback. Tell me if this needs a native rebuild.
4. Don't restyle any screen yet.

Run `npm test` and `npx tsc --noEmit` from mobile/, fix anything that fails, then commit as
"style(mobile): add theme tokens, fonts, force LTR layout".
```

### Step 2: shared building blocks

```
Using mobile/src/theme.ts, create small reusable components in mobile/src/components/ui/:
- Card: white surface, radius 20, 1px border, padding 16, optional title (cardTitle) and helper text (caption).
- Chip: pill (height 44, radius 22, padding 0 16). Unselected = chip fill + text color; selected = primary fill
  + white text. Optional leading Ionicons icon (16px). Props: label, selected, onPress, onLongPress, icon.
  Use accessibilityRole="button" and accessibilityState={{ selected }}.
- ChipRow: wraps chips with gap 8 (flexWrap), or a horizontal ScrollView when `scroll` is set.
- ToggleRow: title + caption on the left, a Switch on the right (trackColor true = primary).
- IconTile: 36x36 square, radius 12, background color prop, Ionicons icon (20px) colored by a prop.
- PrimaryButton (filled primary, height 44, radius 22, bodyBold 15) and TextButton (primaryDark text, height 44).
- SectionLabel: the uppercase small heading used on the notes list.
Use Ionicons from @expo/vector-icons (already in the app) for all icons. No screen changes yet.
Run `npm test` and `npx tsc --noEmit`, then commit "feat(mobile): add shared UI components for redesign".
```

### Step 3: notes grouping logic (test first)

```
Add a pure function for grouping notes on the notes list, test-first.

Create mobile/src/lib/noteSections.test.ts first, then mobile/src/lib/noteSections.ts with
`groupNotes(notes: Note[], now: Date): { title: string; key: string; notes: Note[] }[]`.
Rules:
- reminders_enabled === false -> section "Alerts off" (always last).
- Note has remind_on_date: today -> "Today"; tomorrow -> "Tomorrow · Mon 5 Oct" style (short weekday, day,
  short month, English); a later date -> "Wed 7 Oct" style; a past date -> "Earlier".
- No date but a time (remind_at_hour, or an HH:MM in contexts, same rule as reminderLabel in
  src/lib/noteLabels.ts) -> "Today" (it repeats daily).
- No date and no time -> "Smart alerts".
- Order: Earlier, Today, Tomorrow, later dates ascending, Smart alerts, Alerts off. Empty sections are left out.
- Inside a section sort by time ascending; notes with no time keep their current order.
Also export `noteTime(note): string | null` returning "HH:MM" (reuse the logic in reminderLabel instead
of copying it; refactor noteLabels.ts so both use one helper).
Cover: each rule, the order, sorting, midnight/date boundaries using a fixed `now`, and an older note missing
reminders_enabled (counts as on).
Run `npm test`, then commit "feat(mobile): group notes by day for the notes list".
```

### Step 4: notes list screen

```
Restyle the notes list to the new design. Keep every existing behavior (pull to refresh, swipe to delete,
long-press delete on a note, long-press a folder chip to delete the folder, create folder modal, FAB adds a
note into the active folder).

Layout of NotesListScreen (hide the stack header for this screen, use SafeAreaView, background = colors.background):
1. Header row (padding 16/16/8/20): "My Notes" in screenTitle, then on the right:
   - a place chip (height 44, primarySoft fill, primaryDark text, location-outline icon) reading "At <place name>",
     or "No place" when unknown. Read the current place with getReminderLocation() and the names from
     loadPlaces(). Tapping it opens the Settings tab.
   - a 44x44 icon button (folder-outline) that opens the existing "Create New List" modal (remove the old
     secondary floating folder button).
2. Folder chips row: ChipRow with `scroll` of Chip components, selected = active tab. Take the order from
   folderTabs() in src/lib/folderOrder.ts (All, then General, then the other folders alphabetically), as the
   current screen does; don't sort again. Long-press a folder chip (not All or General) to delete it.
3. SectionList using groupNotes() from src/lib/noteSections.ts, section headers with SectionLabel
   (margin 12 4 0 4), gap 8 between cards, padding 0 16, bottom padding so the FAB never covers the last card.
4. FAB: 56x56, radius 18, primary fill, white "add" icon, bottom-right 16 above the tab bar, soft shadow.
5. Empty state: keep it, restyled with theme colors.

NoteCard (keep Swipeable delete):
- Row: white card, radius 16, 1px border, padding 12/16, gap 12.
- Left: IconTile. Background = the user's category color (colorFor), icon color = textColorFor(that color),
  so user-chosen colors keep working. Icons: scheduled=time-outline, reminder=notifications-outline,
  errand=bag-outline, task=checkbox-outline, idea=bulb-outline, uncategorized=reorder-three-outline.
- Middle: note text (body, max 2 lines), then a meta line (caption): category name capitalized (bodySemi, in the
  category color if contrastRatio(color, "#FFFFFF") >= 4.5, else textMuted), then " · " + location-outline icon +
  place name when the note has a place, then " · " + folder name when it isn't General.
- Right: the time from noteTime() (17, bodyBold, tabular-nums) when there is one; otherwise a sparkles-outline icon
  in primary for smart alerts, or notifications-off-outline in textMuted when alerts are off.
Note text can be Hebrew: give note Text writingDirection "auto" so it reads naturally.

Bottom tab bar (App.tsx): white, top border colors.border, height 76 plus safe-area inset, labels 12 Figtree;
active tab = primaryDark label + a 60x30 primarySoft pill behind the icon (radius 15); inactive = textMuted.
Icons: Notes = document-text-outline, Settings = options-outline.

Run `npm test` and `npx tsc --noEmit`, then commit "style(mobile): redesign notes list".
```

### Step 5: edit note screen

```
Restyle AddEditNoteScreen to the new design. Keep all current fields and logic (save, smart vs explicit
category/place/date/time, reminders_enabled, folder, date and time pickers, reset to smart).

- Custom header (hide the native one): 44x44 back button (arrow-back), title "Edit note" or "New note"
  (display font 22), PrimaryButton "Save" on the right. Background colors.background, cards stacked with gap 12, padding 16, in a ScrollView with keyboardShouldPersistTaps="handled".
- Card 1 "Note": small caption label "Note", then the TextInput (22, bodySemi, no border, multiline, grows,
  writingDirection auto).
- Card 2 "Phone alert": ToggleRow title "Phone alert", caption "Turn off for notes that should stay silent."
  bound to reminders_enabled. Below it a 2-column grid of two tiles (background colors.background, border,
  radius 14, padding 10/12): "Date" and "Time". Each shows the explicit value, or "Smart" with a
  sparkles-outline icon in primaryDark when not set. Tapping opens the existing pickers. Then a row: caption
  "Smart uses the date and time found in your note." and a TextButton "Reset to Smart" that clears the explicit
  date and time (existing behavior). Dim the grid when the alert is off.
- Card 3 "Category": ChipRow; first chip "Smart" with sparkles-outline, then Task, Errand, Idea, Reminder,
  Scheduled. Selected = primary fill.
- Card 4 "Place": ChipRow; "Smart" chip, then the user's places by name.
- Card 5 "Folder": ChipRow of existing folders (General first) keeping the current behavior for choosing a folder.
Run `npm test` and `npx tsc --noEmit`, then commit "style(mobile): redesign edit note screen".
```

### Step 6: settings screen

```
Restyle SettingsScreen to the new design. Keep every existing behavior: current reminder context, saved
places with Use current location / Search address (AddressSearchModal) / Rename (PlaceEditorModal) / Forget /
Delete, the location permission flow, category colors with CategoryColorModal, phone notifications switch,
Check alerts now, sign out.

Header "Settings" (screenTitle, hide the native header), then cards (gap 12, padding 16) in this order:
1. "Where you are now" + caption "Set automatically when you arrive at a saved place. Tap to override."
   ChipRow of the places plus "Not at a place"; the selected one gets a location-outline icon.
2. "Saved places" + caption "Names sync to your account. Locations stay on this phone."
   One row per place separated by 1px border lines: 40x40 round icon (primarySoft/primaryDark when its
   location is set, chip/textMuted when not), name (body), and under it a caption (max 2 lines) from
   placeSubtitle(place) in src/lib/userPlaces.ts: the saved address when set by Search address,
   "Set from current location", "No location set", or "Location saved" for older locations, followed by
   " · 400 m" (the place's radius) when a location is set. Keep using that helper.
   When the place has a location, below the name a "Radius" row of four Chips (100 m, 200 m, 400 m, 800 m),
   the current radius selected, each with accessibilityLabel "<place name> radius <n> m". Tapping one keeps
   today's handleSetRadius (setPlaceRadius, then refresh and syncGeofencing, which re-registers geofences
   only because the region changed). On the right:
   - when not set: a small primarySoft button "Set location" that opens an Alert with "Use current location",
     "Search address", "Cancel".
   - always: a 44x44 "ellipsis-vertical" button opening an Alert with: "Use current location",
     "Search address", "Rename", "Forget location" (only when set), "Delete" (destructive), "Cancel".
     Give it an accessibilityLabel like "Home options".
   Last row: "+ Add place" text button in primaryDark.
   "Search address" opens AddressSearchModal with today's select-then-save flow, restyled with the theme:
   Search button, results as bordered rows (tap selects: highlighted + radio icon, accessibilityState
   selected), "Selected address" box showing the full address, and a PrimaryButton "Save as <place name>"
   that stays disabled until a result is selected; saving closes it and shows the "Location saved" alert.
   Keep keyboardShouldPersistTaps="handled" on the results list, the testID "selected-address", and the
   button labels, so src/components/AddressSearchModal.test.tsx keeps passing unchanged.
3. "Category colors": keep the current list, restyled as rows: 28px color swatch circle, category name,
   chevron; tapping opens CategoryColorModal as today.
4. "Phone notifications": ToggleRow with caption "Show reminders on this phone.", then a bordered row button
   "Check alerts now" with a refresh-outline icon in primaryDark.
5. Account card: caption "Signed in as", the email (one line, ellipsis), and a red "Sign out" text button.
Run `npm test` and `npx tsc --noEmit`, then commit "style(mobile): redesign settings screen".
```

### Step 7: login screen, then build on the phone

```
Restyle LoginScreen with the same theme (background, white card, PrimaryButton, display-font title, inputs
with border colors.border and radius 14, height 48). Keep Google Sign-In and email/password exactly as they
work now. Run `npm test` and `npx tsc --noEmit`, commit "style(mobile): redesign login screen", then push
the `redesign` branch.
```

Then build it yourself in PowerShell (Chrome and the emulator closed):

```
cd C:\fc\app
git fetch
git checkout redesign
git pull
cd mobile
npm install
npx expo run:android --variant release --device
```

When it looks right on the phone, merge `redesign` into `main` (ask Claude Code to do it) and switch C:\fc\app back to `main`.

## Phone check after step 7

1. Notes list shows sections (Today, Tomorrow, Smart alerts) with times on the right, and your category colors on the icon squares.
2. The "At …" chip at the top shows the place chosen in Settings, and tapping it opens Settings.
3. Swipe a note left to delete; long-press a folder chip to delete a folder.
4. Edit a note: change time, Reset to Smart, turn Phone alert off, change folder, Save. The alarm still fires (or doesn't, when off).
5. Settings: set a place by Search address, Forget it, change a category color, Check alerts now.
6. Text and layout run left-to-right; Hebrew note text still reads correctly.
