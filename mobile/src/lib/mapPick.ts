import { AddressResult } from "./nominatim";
import { distanceMeters, LatLon } from "./geo";
import { DEFAULT_RADIUS_METERS, UserPlace } from "./userPlaces";

// "Pick on map" for a place's location: a Leaflet map with OpenStreetMap
// tiles in a WebView (no Google API key). The map moves under a pin fixed
// in the middle; the page reports the center after each move.

export interface MapView {
  latitude: number;
  longitude: number;
  radius: number; // meters, drawn as a circle around the pin
  zoom: number;
  from: "place" | "current" | "default";
}

// nothing better to start from: central Tel Aviv, zoomed out
export const DEFAULT_VIEW: MapView = {
  latitude: 32.0853,
  longitude: 34.7818,
  radius: DEFAULT_RADIUS_METERS,
  zoom: 12,
  from: "default",
};

const CLOSE_ZOOM = 17;

// OpenStreetMap blocks tile requests from WebViews that carry neither a
// Referer nor X-Requested-With (checked for the S8's WebView). Loading the
// page with an https base URL makes the WebView send a Referer.
export const MAP_BASE_URL = "https://contextmind-api.azurewebsites.net/";

// an address from reverse geocoding counts only if it's this close to the pin
const ADDRESS_MAX_DISTANCE_M = 150;

export function initialMapView(place: UserPlace, position: LatLon | null): MapView {
  if (place.coords) {
    const { latitude, longitude, radius } = place.coords;
    return { latitude, longitude, radius, zoom: CLOSE_ZOOM, from: "place" };
  }
  if (position) {
    return {
      latitude: position.latitude,
      longitude: position.longitude,
      radius: DEFAULT_RADIUS_METERS,
      zoom: CLOSE_ZOOM,
      from: "current",
    };
  }
  return DEFAULT_VIEW;
}

// {"type":"center","lat":..,"lon":..} from the page; anything else is ignored
export function parseMapMessage(data: string): LatLon | null {
  try {
    const msg = JSON.parse(data);
    const lat = msg?.lat;
    const lon = msg?.lon;
    if (msg?.type !== "center" || typeof lat !== "number" || typeof lon !== "number") {
      return null;
    }
    return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { latitude: lat, longitude: lon } : null;
  } catch {
    return null;
  }
}

// Nominatim answers a "lat,lon" search with the nearest address
export function addressNear(results: AddressResult[], point: LatLon): string | null {
  const near = results.find((r) => distanceMeters(point, r) <= ADDRESS_MAX_DISTANCE_M);
  return near ? near.label : null;
}

export function mapHtml(view: MapView): string {
  const lat = Number(view.latitude);
  const lon = Number(view.longitude);
  const zoom = Number(view.zoom);
  const radius = Number(view.radius);
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
  integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="">
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
  integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>
<style>
  html, body, #map { height: 100%; margin: 0; }
  #pin { position: absolute; left: 50%; top: 50%; width: 36px; height: 48px;
    margin-left: -18px; margin-top: -46px; z-index: 1000; pointer-events: none; }
</style>
</head>
<body>
<div id="map"></div>
<svg id="pin" viewBox="0 0 36 48" xmlns="http://www.w3.org/2000/svg">
  <path d="M18 46 C 9 33, 2 26, 2 17 A 16 16 0 1 1 34 17 C 34 26, 27 33, 18 46 Z"
    fill="#1F7A3A" stroke="#FFFFFF" stroke-width="2"/>
  <circle cx="18" cy="17" r="6" fill="#FFFFFF"/>
</svg>
<script>
  var map = L.map('map', { zoomControl: true }).setView([${lat}, ${lon}], ${zoom});
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);
  var circle = L.circle(map.getCenter(), {
    radius: ${radius}, color: '#1F7A3A', weight: 2, fillColor: '#1F7A3A', fillOpacity: 0.12
  }).addTo(map);
  function report() {
    var c = map.getCenter();
    circle.setLatLng(c);
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'center', lat: c.lat, lon: c.lng }));
    }
  }
  map.on('move', function () { circle.setLatLng(map.getCenter()); });
  map.on('moveend', report);
  map.on('click', function (e) { map.panTo(e.latlng); });
  report();
</script>
</body>
</html>`;
}
