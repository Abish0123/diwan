/**
 * Reusable address picker — type-to-search (server-proxied Nominatim) with a
 * manual pin-drop fallback for addresses the search can't find. Used anywhere
 * we need to capture a real-world drop-off/pickup location (admission form,
 * route planner, etc).
 */
import { useState, useRef, useCallback } from "react";
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Search, RefreshCw, Crosshair, MapPin, X } from "lucide-react";

const pinIcon = new L.Icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) || window.location.origin;
const DEFAULT_CENTER: [number, number] = [
  Number(import.meta.env.VITE_SCHOOL_LAT) || 25.2854,
  Number(import.meta.env.VITE_SCHOOL_LNG) || 51.5310,
];

export interface PickedLocation {
  address: string;
  lat: number;
  lng: number;
}

interface Suggestion { name: string; address: string; lat: number; lng: number; }

function PinPicker({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) { onPick(e.latlng.lat, e.latlng.lng); },
  });
  return null;
}

export function LocationPicker({
  value,
  onChange,
  placeholder = "Search address or place name…",
}: {
  value: PickedLocation | null;
  onChange: (loc: PickedLocation | null) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loadingSug, setLoadingSug] = useState(false);
  const [showPinMap, setShowPinMap] = useState(false);
  const [pinLatLng, setPinLatLng] = useState<{ lat: number; lng: number } | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!q.trim()) { setSuggestions([]); return; }
    debounceRef.current = setTimeout(async () => {
      setLoadingSug(true);
      try {
        const res = await fetch(`${API_URL}/api/places/search?q=${encodeURIComponent(q)}`);
        if (res.ok) setSuggestions(await res.json());
      } catch { /* ignore */ }
      finally { setLoadingSug(false); }
    }, 350);
  }, []);

  const selectSuggestion = (s: Suggestion) => {
    onChange({ address: s.address, lat: s.lat, lng: s.lng });
    setQuery("");
    setSuggestions([]);
  };

  const openPinMap = () => {
    setPinLatLng(value ? { lat: value.lat, lng: value.lng } : null);
    setShowPinMap(true);
  };

  const usePinnedLocation = () => {
    if (!pinLatLng) return;
    onChange({
      address: query.trim() || `Pinned location (${pinLatLng.lat.toFixed(4)}, ${pinLatLng.lng.toFixed(4)})`,
      lat: pinLatLng.lat,
      lng: pinLatLng.lng,
    });
    setQuery("");
    setShowPinMap(false);
    setPinLatLng(null);
  };

  if (value) {
    return (
      <div className="flex items-start gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
        <MapPin className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-emerald-800 truncate">{value.address}</p>
          <p className="text-[10px] text-emerald-600 font-mono">{value.lat.toFixed(5)}, {value.lng.toFixed(5)}</p>
        </div>
        <button type="button" onClick={() => onChange(null)}
          className="h-6 w-6 flex items-center justify-center text-emerald-500 hover:text-emerald-700 hover:bg-emerald-100 rounded shrink-0 transition-colors">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="relative">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              value={query}
              onChange={e => { setQuery(e.target.value); search(e.target.value); }}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); if (suggestions.length) selectSuggestion(suggestions[0]); } }}
              placeholder={placeholder}
              className="w-full h-9 pl-9 pr-3 border rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-400"
            />
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            {loadingSug && (
              <RefreshCw className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-slate-400" />
            )}
          </div>
          <button
            type="button"
            onClick={openPinMap}
            title="Can't find the address? Drop a pin on the map instead"
            className="h-9 px-3 flex items-center gap-1.5 bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 rounded-md text-sm font-medium transition-colors shrink-0">
            <Crosshair className="h-3.5 w-3.5" /> Pin
          </button>
        </div>
        {suggestions.length > 0 && (
          <div className="absolute z-50 top-10 left-0 right-10 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
            {suggestions.map((s, i) => (
              <button
                key={i}
                type="button"
                onClick={() => selectSuggestion(s)}
                className="w-full text-left px-4 py-2.5 hover:bg-violet-50 border-b last:border-0 transition-colors"
              >
                <p className="text-sm font-semibold text-slate-800 truncate">{s.name}</p>
                <p className="text-[11px] text-slate-400 truncate">{s.address}</p>
              </button>
            ))}
          </div>
        )}
      </div>

      {showPinMap && (
        <div className="mt-3 border rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 bg-blue-50 border-b border-blue-100">
            <p className="text-xs font-semibold text-blue-700 flex items-center gap-1.5">
              <Crosshair className="h-3.5 w-3.5" /> Click on the map to drop a pin
            </p>
            <button type="button" onClick={() => { setShowPinMap(false); setPinLatLng(null); }}
              className="text-slate-400 hover:text-slate-600 text-xs font-medium">
              Cancel
            </button>
          </div>
          <MapContainer center={DEFAULT_CENTER} zoom={12} style={{ width: "100%", height: "220px" }}>
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            />
            <PinPicker onPick={(lat, lng) => setPinLatLng({ lat, lng })} />
            {pinLatLng && <Marker position={[pinLatLng.lat, pinLatLng.lng]} icon={pinIcon} />}
          </MapContainer>
          <div className="flex items-center justify-between gap-2 px-3 py-2 bg-slate-50 border-t">
            <p className="text-[11px] text-slate-500 font-mono">
              {pinLatLng ? `${pinLatLng.lat.toFixed(5)}, ${pinLatLng.lng.toFixed(5)}` : "No pin dropped yet"}
            </p>
            <button type="button" disabled={!pinLatLng} onClick={usePinnedLocation}
              className="h-7 px-3 rounded-lg bg-purple-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold transition-colors">
              Use this location
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
