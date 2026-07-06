import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LatLngBounds } from "leaflet";
import {
  CircleMarker,
  MapContainer,
  Polyline,
  TileLayer,
  Tooltip,
  useMap,
} from "react-leaflet";

const TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTR =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

const ROUTE_COLORS = [
  "#27CC5E",
  "#EEC253",
  "#3b82f6",
  "#ef4444",
  "#8b5cf6",
  "#f97316",
  "#06b6d4",
  "#ec4899",
  "#84cc16",
  "#f59e0b",
  "#14b8a6",
  "#a855f7",
];

type Sighting = {
  sighting_uuid: string;
  beacon_mac: string;
  registered_device_uuid: string;
  rssi: number | null;
  latitude: number;
  longitude: number;
  location_accuracy_meters: number | null;
  observed_at: number;
  source: string;
  frame_type: string;
};

type RouteGroup = {
  key: string;
  beacon_mac: string;
  color: string;
  sightings: Sighting[];
  visible: boolean;
};

// RFC 4180-compliant CSV parser
function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/);
  if (lines.length < 2) return [];

  function parseLine(line: string): string[] {
    const fields: string[] = [];
    let i = 0;
    while (i <= line.length) {
      if (i === line.length) { fields.push(""); break; }
      if (line[i] === '"') {
        let val = "";
        i++;
        while (i < line.length) {
          if (line[i] === '"' && line[i + 1] === '"') { val += '"'; i += 2; }
          else if (line[i] === '"') { i++; break; }
          else { val += line[i++]; }
        }
        fields.push(val);
        if (i < line.length && line[i] === ',') i++;
      } else {
        const end = line.indexOf(',', i);
        if (end === -1) { fields.push(line.slice(i)); break; }
        fields.push(line.slice(i, end));
        i = end + 1;
      }
    }
    return fields;
  }

  const rawHeaders = parseLine(lines[0]);
  const headers = rawHeaders.map((h) => h.replace(/^"|"$/g, "").trim());

  const rows: Record<string, string>[] = [];
  for (let r = 1; r < lines.length; r++) {
    const line = lines[r].trim();
    if (!line) continue;
    const values = parseLine(line);
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = values[i] ?? ""; });
    rows.push(obj);
  }
  return rows;
}

function formatTime(unix: number): string {
  return new Date(unix * 1000).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

function shortId(id: string): string {
  const parts = id.split("_");
  return parts[parts.length - 1].slice(0, 8);
}

function MapFitter({ groups }: { groups: RouteGroup[] }) {
  const map = useMap();

  useEffect(() => {
    const all = groups
      .filter((g) => g.visible)
      .flatMap((g) => g.sightings.map((s) => [s.latitude, s.longitude] as [number, number]));
    if (all.length === 0) return;
    const bounds = new LatLngBounds(all);
    if (bounds.isValid()) {
      map.fitBounds(bounds.pad(0.12), { animate: false });
    }
  }, [groups, map]);

  return null;
}

export function SightingsMapScreen() {
  const [fileName, setFileName] = useState<string | null>(null);
  const [totalRows, setTotalRows] = useState(0);
  const [groups, setGroups] = useState<RouteGroup[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [mapKey, setMapKey] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback((file: File) => {
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setError("Please upload a .csv file.");
      return;
    }
    setError(null);
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const rows = parseCSV(text);
      setTotalRows(rows.length);

      const groupMap = new Map<string, Sighting[]>();

      for (const row of rows) {
        const lat = parseFloat(row.latitude);
        const lng = parseFloat(row.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) continue;

        const key =
          row.registered_device_uuid ||
          row.beacon_mac_normalized ||
          row.beacon_mac ||
          "unknown";

        const sighting: Sighting = {
          sighting_uuid: row.sighting_uuid,
          beacon_mac: row.beacon_mac,
          registered_device_uuid: row.registered_device_uuid,
          rssi: row.rssi !== "" && row.rssi !== "NULL" ? parseFloat(row.rssi) : null,
          latitude: lat,
          longitude: lng,
          location_accuracy_meters:
            row.location_accuracy_meters !== "" && row.location_accuracy_meters !== "NULL"
              ? parseFloat(row.location_accuracy_meters)
              : null,
          observed_at: parseInt(row.observed_at, 10),
          source: row.source,
          frame_type: row.frame_type,
        };

        if (!groupMap.has(key)) groupMap.set(key, []);
        groupMap.get(key)!.push(sighting);
      }

      const newGroups: RouteGroup[] = Array.from(groupMap.entries()).map(
        ([key, sightings], i) => ({
          key,
          beacon_mac: sightings[0].beacon_mac,
          color: ROUTE_COLORS[i % ROUTE_COLORS.length],
          sightings: [...sightings].sort((a, b) => a.observed_at - b.observed_at),
          visible: true,
        }),
      );

      setGroups(newGroups);
      setMapKey((k) => k + 1);
    };
    reader.readAsText(file);
  }, []);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  const toggleGroup = (key: string) =>
    setGroups((prev) => prev.map((g) => (g.key === key ? { ...g, visible: !g.visible } : g)));

  const visibleGroups = groups.filter((g) => g.visible);
  const totalSightings = groups.reduce((n, g) => n + g.sightings.length, 0);

  const timeRange = useMemo(() => {
    if (groups.length === 0) return null;
    const all = groups.flatMap((g) => g.sightings.map((s) => s.observed_at));
    return { min: Math.min(...all), max: Math.max(...all) };
  }, [groups]);

  const hasData = groups.length > 0;
  const allVisible = groups.every((g) => g.visible);

  return (
    <div className="sm-root">
      <div className="sm-sidebar">
        <div className="sm-sidebar-top">
          <h2 className="sm-title">Sightings Map</h2>
          <p className="sm-subtitle">Visualize beacon sighting routes from a CSV export</p>
        </div>

        <div
          className={`sm-dropzone${dragging ? " sm-dropzone--dragging" : ""}${hasData ? " sm-dropzone--compact" : ""}`}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === "Enter" && fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            style={{ display: "none" }}
            onChange={handleFileInput}
          />
          {hasData ? (
            <>
              <span className="sm-dropzone-icon">📄</span>
              <span className="sm-dropzone-filename">{fileName}</span>
              <span className="sm-dropzone-replace">Click to replace file</span>
            </>
          ) : (
            <>
              <span className="sm-dropzone-icon">⬆</span>
              <span className="sm-dropzone-prompt">Drop CSV or click to upload</span>
              <span className="sm-dropzone-hint">beacon_sightings export</span>
            </>
          )}
        </div>

        {error && <div className="sm-upload-error">{error}</div>}

        {hasData && (
          <>
            <div className="sm-stats-strip">
              <div className="sm-stat-pill">
                <span className="sm-stat-value">{totalRows.toLocaleString()}</span>
                <span className="sm-stat-label">rows</span>
              </div>
              <div className="sm-stat-pill">
                <span className="sm-stat-value">{totalSightings.toLocaleString()}</span>
                <span className="sm-stat-label">mapped</span>
              </div>
              <div className="sm-stat-pill">
                <span className="sm-stat-value">{groups.length}</span>
                <span className="sm-stat-label">devices</span>
              </div>
            </div>

            {timeRange && (
              <div className="sm-timerange">
                <span className="sm-timerange-label">Time range</span>
                <div className="sm-timerange-vals">
                  <span>{formatTime(timeRange.min)}</span>
                  <span className="sm-timerange-arrow">→</span>
                  <span>{formatTime(timeRange.max)}</span>
                </div>
              </div>
            )}

            <div className="sm-routes-section">
              <div className="sm-routes-header">
                <span className="sm-routes-title">Routes</span>
                <button
                  className="sm-toggle-all-btn"
                  type="button"
                  onClick={() =>
                    setGroups((prev) => prev.map((g) => ({ ...g, visible: !allVisible })))
                  }
                >
                  {allVisible ? "Hide all" : "Show all"}
                </button>
              </div>

              <div className="sm-routes-list">
                {groups.map((group) => (
                  <div
                    key={group.key}
                    className={`sm-route-row${group.visible ? "" : " sm-route-row--off"}`}
                    onClick={() => toggleGroup(group.key)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === "Enter" && toggleGroup(group.key)}
                  >
                    <span
                      className="sm-route-swatch"
                      style={{ background: group.color, opacity: group.visible ? 1 : 0.3 }}
                    />
                    <div className="sm-route-labels">
                      <span className="sm-route-mac">{group.beacon_mac || "Unknown"}</span>
                      <span className="sm-route-devid">{shortId(group.key)}</span>
                    </div>
                    <span className="sm-route-badge">{group.sightings.length}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      <div className="sm-map-wrap">
        {!hasData ? (
          <div className="sm-map-empty">
            <span className="sm-map-empty-icon">🗺</span>
            <strong>No data loaded</strong>
            <span>Upload a CSV export to plot beacon routes here</span>
          </div>
        ) : (
          <MapContainer
            key={mapKey}
            center={[0, 0]}
            zoom={2}
            style={{ height: "100%", width: "100%" }}
            zoomControl
          >
            <TileLayer url={TILE_URL} attribution={TILE_ATTR} />
            <MapFitter groups={groups} />

            {visibleGroups.map((group) => {
              const positions = group.sightings.map(
                (s) => [s.latitude, s.longitude] as [number, number],
              );
              const last = group.sightings.length - 1;

              return (
                <Fragment key={group.key}>
                  <Polyline
                    positions={positions}
                    pathOptions={{ color: group.color, weight: 3, opacity: 0.85 }}
                  />
                  {group.sightings.map((s, i) => {
                    const isEndpoint = i === 0 || i === last;
                    return (
                      <CircleMarker
                        key={s.sighting_uuid || `${group.key}-${i}`}
                        center={[s.latitude, s.longitude]}
                        radius={isEndpoint ? 7 : 4}
                        pathOptions={{
                          color: group.color,
                          fillColor: group.color,
                          fillOpacity: i === 0 ? 1 : i === last ? 0.9 : 0.45,
                          weight: isEndpoint ? 2.5 : 1,
                        }}
                      >
                        <Tooltip sticky direction="top">
                          <strong style={{ color: group.color }}>{group.beacon_mac}</strong>
                          <br />
                          {formatTime(s.observed_at)}
                          {s.rssi != null && (
                            <>
                              <br />
                              RSSI: {s.rssi} dBm
                            </>
                          )}
                          {s.location_accuracy_meters != null && (
                            <>
                              <br />
                              ±{s.location_accuracy_meters.toFixed(0)} m
                            </>
                          )}
                          {s.source && (
                            <>
                              <br />
                              <span style={{ opacity: 0.6 }}>{s.source}</span>
                            </>
                          )}
                          {i === 0 && (
                            <>
                              <br />
                              <em>▶ Start</em>
                            </>
                          )}
                          {i === last && i !== 0 && (
                            <>
                              <br />
                              <em>■ End</em>
                            </>
                          )}
                        </Tooltip>
                      </CircleMarker>
                    );
                  })}
                </Fragment>
              );
            })}
          </MapContainer>
        )}
      </div>
    </div>
  );
}
