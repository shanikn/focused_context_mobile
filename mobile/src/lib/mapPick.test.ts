import {
  addressNear,
  DEFAULT_VIEW,
  initialMapView,
  jumpToScript,
  mapHtml,
  MAP_BASE_URL,
  parseMapMessage,
} from "./mapPick";
import { UserPlace } from "./userPlaces";

const place = (coords: UserPlace["coords"]): UserPlace => ({
  id: "id-home",
  name: "Home",
  keywords: [],
  kind: "home",
  coords,
});
const FIX = { latitude: 32.17, longitude: 34.84, accuracy: 20, timestamp: 0 };

describe("where the map opens", () => {
  test("the place's saved location and radius, zoomed in", () => {
    expect(initialMapView(place({ latitude: 32.1, longitude: 34.8, radius: 400 }), FIX)).toEqual({
      latitude: 32.1,
      longitude: 34.8,
      radius: 400,
      zoom: 17,
      from: "place",
    });
  });

  test("no saved location: where I am, with the default radius", () => {
    expect(initialMapView(place(null), FIX)).toEqual({
      latitude: 32.17,
      longitude: 34.84,
      radius: 200,
      zoom: 17,
      from: "current",
    });
  });

  test("neither: a default view, zoomed out", () => {
    expect(initialMapView(place(null), null)).toEqual(DEFAULT_VIEW);
    expect(DEFAULT_VIEW.from).toBe("default");
    expect(DEFAULT_VIEW.zoom).toBeLessThan(17);
  });
});

describe("messages from the map", () => {
  test("the center after the map moves", () => {
    expect(parseMapMessage('{"type":"center","lat":32.1,"lon":34.8}')).toEqual({ latitude: 32.1, longitude: 34.8 });
  });

  test.each(["", "not json", '{"type":"other"}', '{"type":"center","lat":95,"lon":34}', '{"type":"center","lat":"x"}'])(
    "ignores %p",
    (data) => {
      expect(parseMapMessage(data)).toBeNull();
    }
  );
});

describe("the address for a pinned point", () => {
  const point = { latitude: 32.1663, longitude: 34.8433 };

  test("the first result close to the pin (Nominatim answers a coordinate search with the nearest address)", () => {
    const results = [
      { label: "Far away", latitude: 32.2, longitude: 34.9 },
      { label: "5 Sirkin St, Herzliya", latitude: 32.1666, longitude: 34.8439 },
    ];
    expect(addressNear(results, point)).toBe("5 Sirkin St, Herzliya");
  });

  test("nothing within 150 m: no address", () => {
    expect(addressNear([{ label: "Far away", latitude: 32.18, longitude: 34.8433 }], point)).toBeNull();
    expect(addressNear([], point)).toBeNull();
  });
});

describe("the map page", () => {
  const html = mapHtml({ latitude: 32.1, longitude: 34.8, radius: 400, zoom: 17, from: "place" });

  test("OpenStreetMap tiles with attribution, no Google", () => {
    expect(html).toContain("https://tile.openstreetmap.org/{z}/{x}/{y}.png");
    expect(html).toContain("OpenStreetMap");
    expect(html.toLowerCase()).not.toContain("google");
  });

  test("Leaflet from a pinned CDN version, centered with the radius circle", () => {
    expect(html).toMatch(/leaflet@1\.9\.4\/dist\/leaflet\.js/);
    expect(html).toContain("setView([32.1, 34.8], 17)");
    expect(html).toContain("radius: 400");
  });

  test("a base URL so tile requests carry a Referer (OSM blocks WebViews without one)", () => {
    expect(MAP_BASE_URL).toMatch(/^https:\/\//);
  });
});

describe("jumping to a search result", () => {
  test("moves the map (the page then reports the new center)", () => {
    expect(jumpToScript({ latitude: 32.0641, longitude: 34.7748 })).toBe("map.setView([32.0641, 34.7748], 17); true;");
  });

  test("only numbers get into the script", () => {
    expect(jumpToScript({ latitude: Number("1);alert(1"), longitude: 34 })).toBe("true;");
    expect(jumpToScript({ latitude: 95, longitude: 34 })).toBe("true;");
  });
});
