// defines how a note looks like

//  like note_to_dict
export interface Note {
    _id: string;
    content: string;
    created_at: string;
    category: string;
    contexts: string[];
    list_name: string;
    shown_count: number;
    dismissed_count: number;
    useful_count: number;
    never_show: boolean;
    last_shown: string | null;
    cooldown_until: string | null;
    reminders_enabled: boolean;
    category_explicit: boolean;
    remind_date_explicit: boolean;
    remind_time_explicit: boolean;
    remind_at_hour: number | null;
    remind_at_minute: number | null;
    remind_on_date: string | null;
    user_id: string | null;
}
