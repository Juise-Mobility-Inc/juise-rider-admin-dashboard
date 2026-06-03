import { divIcon, Icon } from "leaflet";

export const visitedPoiIcon = new Icon({
  iconUrl: "/markers/poi-visited.png",
  iconSize: [32, 32],
  iconAnchor: [16, 16],
  popupAnchor: [0, -18],
});

export const unvisitedPoiIcon = new Icon({
  iconUrl: "/markers/poi-unvisited.png",
  iconSize: [32, 32],
  iconAnchor: [16, 16],
  popupAnchor: [0, -18],
});

export const noGoPenaltyIcon = new Icon({
  iconUrl: "/markers/penalty-nogo.png",
  iconSize: [32, 32],
  iconAnchor: [16, 16],
  popupAnchor: [0, -18],
});

export const speedPenaltyIcon = new Icon({
  iconUrl: "/markers/penalty-speed.png",
  iconSize: [32, 32],
  iconAnchor: [16, 16],
  popupAnchor: [0, -18],
});

export const juisePackIcon = new Icon({
  iconUrl: "/markers/juise-pack.png",
  iconSize: [40, 40],
  iconAnchor: [20, 20],
  popupAnchor: [0, -22],
});

const beaconBluetoothMarker =
  '<span class="beacon-location-marker-core" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="M7 7l10 10-5 5V2l5 5L7 17" /></svg></span>';

export const beaconLocationIcon = divIcon({
  className: "beacon-location-marker",
  html: beaconBluetoothMarker,
  iconSize: [58, 58],
  iconAnchor: [29, 29],
  popupAnchor: [0, -34],
});

export const staleBeaconLocationIcon = divIcon({
  className: "beacon-location-marker beacon-location-marker--stale",
  html: beaconBluetoothMarker,
  iconSize: [58, 58],
  iconAnchor: [29, 29],
  popupAnchor: [0, -34],
});
