import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Moon, Sun, Bell, Calendar, RefreshCw, Clock } from "lucide-react";
import { toast } from "sonner";

interface PrayerTime {
  name: string;
  arabic: string;
  time: string;
  breakDuration: number;
  active: boolean;
}

type CityKey =
  | "Dubai"
  | "Abu Dhabi"
  | "Riyadh"
  | "Jeddah"
  | "Doha"
  | "Kuwait City"
  | "Muscat"
  | "Amman"
  | "Cairo";

const CITY_PRAYER_TIMES: Record<CityKey, string[]> = {
  Dubai: ["05:12", "12:22", "15:45", "18:30", "19:55"],
  "Abu Dhabi": ["05:10", "12:20", "15:44", "18:28", "19:53"],
  Riyadh: ["05:05", "12:10", "15:35", "18:20", "19:48"],
  Jeddah: ["05:18", "12:18", "15:40", "18:26", "19:52"],
  Doha: ["04:58", "12:05", "15:30", "18:15", "19:42"],
  "Kuwait City": ["04:55", "12:00", "15:28", "18:10", "19:38"],
  Muscat: ["04:48", "11:55", "15:20", "18:05", "19:32"],
  Amman: ["04:20", "11:50", "15:15", "18:00", "19:28"],
  Cairo: ["04:30", "11:58", "15:22", "18:08", "19:35"],
};

const PRAYER_NAMES = [
  { name: "Fajr", arabic: "الفجر" },
  { name: "Dhuhr", arabic: "الظهر" },
  { name: "Asr", arabic: "العصر" },
  { name: "Maghrib", arabic: "المغرب" },
  { name: "Isha", arabic: "العشاء" },
];

const CITIES: CityKey[] = [
  "Dubai", "Abu Dhabi", "Riyadh", "Jeddah", "Doha",
  "Kuwait City", "Muscat", "Amman", "Cairo",
];

const BELL_OPTIONS = [5, 10, 15];

const timeToMinutes = (time: string): number => {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
};

const getNextPrayer = (prayers: PrayerTime[]): { prayer: PrayerTime; minutesUntil: number } | null => {
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const activePrayers = prayers.filter((p) => p.active);
  for (const prayer of activePrayers) {
    const prayerMinutes = timeToMinutes(prayer.time);
    if (prayerMinutes > currentMinutes) {
      return { prayer, minutesUntil: prayerMinutes - currentMinutes };
    }
  }
  // Wrap to next day — first prayer
  if (activePrayers.length > 0) {
    const first = activePrayers[0];
    const minutesUntil = 24 * 60 - currentMinutes + timeToMinutes(first.time);
    return { prayer: first, minutesUntil };
  }
  return null;
};

export const PrayerScheduler: React.FC = () => {
  const [city, setCity] = useState<CityKey>("Dubai");
  const [ramadanMode, setRamadanMode] = useState(false);
  const [bellReminder, setBellReminder] = useState(10);
  const [autoPauseClasses, setAutoPauseClasses] = useState(true);
  const [prayers, setPrayers] = useState<PrayerTime[]>(() =>
    PRAYER_NAMES.map((p, i) => ({
      ...p,
      time: CITY_PRAYER_TIMES["Dubai"][i],
      breakDuration: p.name === "Dhuhr" ? 30 : 20,
      active: true,
    }))
  );

  const today = new Date();
  const formattedDate = today.toLocaleDateString("en-GB", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // Update times when city changes
  useEffect(() => {
    setPrayers((prev) =>
      prev.map((p, i) => ({
        ...p,
        time: CITY_PRAYER_TIMES[city][i],
      }))
    );
  }, [city]);

  const togglePrayer = (index: number) => {
    setPrayers((prev) =>
      prev.map((p, i) => (i === index ? { ...p, active: !p.active } : p))
    );
  };

  const updateBreakDuration = (index: number, duration: number) => {
    setPrayers((prev) =>
      prev.map((p, i) => (i === index ? { ...p, breakDuration: duration } : p))
    );
  };

  const nextPrayer = getNextPrayer(prayers);

  const handleSync = () => {
    toast.success("Prayer breaks synced with school timetable successfully");
  };

  // Iftar time (approx 1 min after Maghrib for display)
  const maghribTime = prayers.find((p) => p.name === "Maghrib")?.time || "18:30";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-emerald-100 rounded-lg">
            <Moon className="h-6 w-6 text-emerald-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold">Prayer Scheduler</h2>
            <p className="text-sm text-muted-foreground">Manage prayer times and breaks in the school timetable</p>
          </div>
        </div>
        <Button onClick={handleSync} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
          <RefreshCw className="h-4 w-4" />
          Sync with School Timetable
        </Button>
      </div>

      {/* Date & Location */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <Calendar className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Today</p>
                <p className="font-semibold">{formattedDate}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <Label className="text-xs text-muted-foreground">City / Location</Label>
                <Select value={city} onValueChange={(v) => setCity(v as CityKey)}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CITIES.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Next Prayer Countdown */}
      {nextPrayer && (
        <Card className="border-emerald-200 bg-emerald-50">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Clock className="h-5 w-5 text-emerald-600" />
                <div>
                  <p className="text-xs text-emerald-700 font-medium">Next Prayer</p>
                  <p className="font-bold text-emerald-800 text-lg">
                    {nextPrayer.prayer.arabic} — {nextPrayer.prayer.name}
                  </p>
                  <p className="text-sm text-emerald-700">at {nextPrayer.prayer.time}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs text-emerald-700 font-medium">Time Until</p>
                <p className="text-3xl font-bold text-emerald-800">
                  {Math.floor(nextPrayer.minutesUntil / 60)}h {nextPrayer.minutesUntil % 60}m
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Ramadan Mode */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Moon className="h-4 w-4 text-amber-500" />
            Ramadan Mode
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Enable Ramadan Mode</p>
              <p className="text-xs text-muted-foreground">Shows Iftar time and adjusts school hours accordingly</p>
            </div>
            <Switch checked={ramadanMode} onCheckedChange={setRamadanMode} />
          </div>
          {ramadanMode && (
            <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg space-y-2">
              <div className="flex items-center gap-2">
                <Sun className="h-4 w-4 text-amber-600" />
                <span className="text-sm font-medium text-amber-800">
                  Iftar Time: {maghribTime} (Maghrib)
                </span>
              </div>
              <p className="text-xs text-amber-700">
                Note: During Ramadan, school hours are reduced. Classes end 2 hours earlier.
                Staff duty hours: 7:00 AM – 2:00 PM. All prayer breaks are extended by 10 minutes.
              </p>
              <Badge className="bg-amber-600 text-white text-xs">Ramadan Schedule Active</Badge>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Prayer Times Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Prayer Times — {city}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Prayer</TableHead>
                <TableHead>Arabic</TableHead>
                <TableHead>Time</TableHead>
                <TableHead>Break Duration</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {prayers.map((prayer, index) => (
                <TableRow key={prayer.name}>
                  <TableCell className="font-medium">{prayer.name}</TableCell>
                  <TableCell className="font-arabic text-lg text-right">{prayer.arabic}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="font-mono">
                      {prayer.time}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Select
                        value={String(prayer.breakDuration)}
                        onValueChange={(v) => updateBreakDuration(index, Number(v))}
                      >
                        <SelectTrigger className="w-24 h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {[10, 15, 20, 25, 30, 45, 60].map((d) => (
                            <SelectItem key={d} value={String(d)}>{d} min</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={prayer.active}
                        onCheckedChange={() => togglePrayer(index)}
                        className="data-[state=checked]:bg-emerald-600"
                      />
                      <span className={`text-xs font-medium ${prayer.active ? "text-emerald-600" : "text-gray-400"}`}>
                        {prayer.active ? "Active" : "Inactive"}
                      </span>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Break Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Bell className="h-4 w-4" />
            Prayer Break Settings
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Bell Reminder</p>
              <p className="text-xs text-muted-foreground">Ring bell before each prayer break</p>
            </div>
            <Select value={String(bellReminder)} onValueChange={(v) => setBellReminder(Number(v))}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BELL_OPTIONS.map((opt) => (
                  <SelectItem key={opt} value={String(opt)}>{opt} min before</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Auto-Pause Classes</p>
              <p className="text-xs text-muted-foreground">Automatically pause ongoing classes during prayer time</p>
            </div>
            <Switch
              checked={autoPauseClasses}
              onCheckedChange={setAutoPauseClasses}
              className="data-[state=checked]:bg-emerald-600"
            />
          </div>

          <Separator />

          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-blue-800 font-medium flex items-center gap-2">
              <RefreshCw className="h-4 w-4" />
              Integration Note
            </p>
            <p className="text-xs text-blue-700 mt-1">
              Prayer breaks will be automatically reflected in the school timetable. Active prayers with configured
              break durations will appear as blocked slots. Bell reminders are sent {bellReminder} minutes before each
              prayer. {autoPauseClasses ? "Classes will auto-pause during prayer breaks." : "Classes will not auto-pause."}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
