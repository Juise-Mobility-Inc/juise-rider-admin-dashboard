import { Icon } from "leaflet";

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
