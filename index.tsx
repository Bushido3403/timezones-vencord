/*
 * Vencord, a modification for Discord's desktop app
 * Copyright (c) 2022 Vendicated and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { addMessageDecoration, removeMessageDecoration } from "@api/MessageDecorations";
import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";
import { findByPropsLazy } from "@webpack";
import { Menu, Tooltip, React } from "@webpack/common";

// Discord exposes a locale getter somewhere deep in webpack land.
// We grab it so we can format dates in the user's language.
const Locale = findByPropsLazy("getLocale");

const STORAGE_KEY = "vencord-timezones";

type TimezoneMap = Record<string, string>;

// Simple in‑memory cache of userId -> timezone.
// Backed by localStorage so it survives restarts.
let userTimezones: TimezoneMap = {};

function loadTimezones() {
    try {
        const raw = settings.store.storedTimezones;
        if (raw && typeof raw === "string") {
            userTimezones = JSON.parse(raw);
        } else {
            userTimezones = {};
        }
    } catch (err) {
        console.warn("[Timezones] Failed to load stored timezones from settings:", err);
        userTimezones = {};
    }
}

function saveTimezones() {
    try {
        settings.store.storedTimezones = JSON.stringify(userTimezones);
    } catch (err) {
        console.warn("[Timezones] Failed to save timezones to settings:", err);
    }
}

// In modern browsers this gives us the list of valid IANA timezones.
// We don't *need* this list right now, but it’s handy if we ever add search.
const allTimezones: string[] = (Intl as any).supportedValuesOf
    ? (Intl as any).supportedValuesOf("timeZone")
    : [];

interface TimezoneOption {
    label: string;
    tz: string;
}

// Timezones so users don’t have to scroll through 300+ cryptic IANA names.
const zonesByRegion: Record<string, TimezoneOption[]> = {
    "Americas": [
        { label: "New York (GMT-5/-4)", tz: "America/New_York" },
        { label: "Chicago (GMT-6/-5)", tz: "America/Chicago" },
        { label: "Denver (GMT-7/-6)", tz: "America/Denver" },
        { label: "Los Angeles (GMT-8/-7)", tz: "America/Los_Angeles" },
        { label: "Phoenix (GMT-7)", tz: "America/Phoenix" },
        { label: "Anchorage (GMT-9/-8)", tz: "America/Anchorage" },
        { label: "Honolulu (GMT-10)", tz: "Pacific/Honolulu" },
        { label: "Toronto (GMT-5/-4)", tz: "America/Toronto" },
        { label: "Vancouver (GMT-8/-7)", tz: "America/Vancouver" },
        { label: "Mexico City (GMT-6)", tz: "America/Mexico_City" },
        { label: "Bogotá (GMT-5)", tz: "America/Bogota" },
        { label: "Lima (GMT-5)", tz: "America/Lima" },
        { label: "Santiago (GMT-3/-4)", tz: "America/Santiago" },
        { label: "São Paulo (GMT-3)", tz: "America/Sao_Paulo" },
        { label: "Buenos Aires (GMT-3)", tz: "America/Argentina/Buenos_Aires" },
        { label: "Caracas (GMT-4)", tz: "America/Caracas" },
        { label: "Havana (GMT-5/-4)", tz: "America/Havana" },
    ],
    "Europe": [
        { label: "London (GMT+0/+1)", tz: "Europe/London" },
        { label: "Dublin (GMT+0/+1)", tz: "Europe/Dublin" },
        { label: "Lisbon (GMT+0/+1)", tz: "Europe/Lisbon" },
        { label: "Paris (GMT+1/+2)", tz: "Europe/Paris" },
        { label: "Berlin (GMT+1/+2)", tz: "Europe/Berlin" },
        { label: "Amsterdam (GMT+1/+2)", tz: "Europe/Amsterdam" },
        { label: "Brussels (GMT+1/+2)", tz: "Europe/Brussels" },
        { label: "Madrid (GMT+1/+2)", tz: "Europe/Madrid" },
        { label: "Rome (GMT+1/+2)", tz: "Europe/Rome" },
        { label: "Vienna (GMT+1/+2)", tz: "Europe/Vienna" },
        { label: "Zurich (GMT+1/+2)", tz: "Europe/Zurich" },
        { label: "Stockholm (GMT+1/+2)", tz: "Europe/Stockholm" },
        { label: "Oslo (GMT+1/+2)", tz: "Europe/Oslo" },
        { label: "Copenhagen (GMT+1/+2)", tz: "Europe/Copenhagen" },
        { label: "Warsaw (GMT+1/+2)", tz: "Europe/Warsaw" },
        { label: "Prague (GMT+1/+2)", tz: "Europe/Prague" },
        { label: "Budapest (GMT+1/+2)", tz: "Europe/Budapest" },
        { label: "Athens (GMT+2/+3)", tz: "Europe/Athens" },
        { label: "Helsinki (GMT+2/+3)", tz: "Europe/Helsinki" },
        { label: "Bucharest (GMT+2/+3)", tz: "Europe/Bucharest" },
        { label: "Istanbul (GMT+3)", tz: "Europe/Istanbul" },
        { label: "Moscow (GMT+3)", tz: "Europe/Moscow" },
        { label: "Kyiv (GMT+2/+3)", tz: "Europe/Kiev" },
    ],
    "Asia": [
        { label: "Dubai (GMT+4)", tz: "Asia/Dubai" },
        { label: "Karachi (GMT+5)", tz: "Asia/Karachi" },
        { label: "Mumbai (GMT+5:30)", tz: "Asia/Kolkata" },
        { label: "Dhaka (GMT+6)", tz: "Asia/Dhaka" },
        { label: "Bangkok (GMT+7)", tz: "Asia/Bangkok" },
        { label: "Hanoi (GMT+7)", tz: "Asia/Ho_Chi_Minh" },
        { label: "Jakarta (GMT+7)", tz: "Asia/Jakarta" },
        { label: "Singapore (GMT+8)", tz: "Asia/Singapore" },
        { label: "Hong Kong (GMT+8)", tz: "Asia/Hong_Kong" },
        { label: "Shanghai (GMT+8)", tz: "Asia/Shanghai" },
        { label: "Beijing (GMT+8)", tz: "Asia/Shanghai" },
        { label: "Taipei (GMT+8)", tz: "Asia/Taipei" },
        { label: "Tokyo (GMT+9)", tz: "Asia/Tokyo" },
        { label: "Seoul (GMT+9)", tz: "Asia/Seoul" },
        { label: "Manila (GMT+8)", tz: "Asia/Manila" },
        { label: "Kuala Lumpur (GMT+8)", tz: "Asia/Kuala_Lumpur" },
        { label: "Tel Aviv (GMT+2/+3)", tz: "Asia/Jerusalem" },
        { label: "Riyadh (GMT+3)", tz: "Asia/Riyadh" },
        { label: "Tehran (GMT+3:30/+4:30)", tz: "Asia/Tehran" },
        { label: "Tashkent (GMT+5)", tz: "Asia/Tashkent" },
    ],
    "Oceania": [
        { label: "Sydney (GMT+10/+11)", tz: "Australia/Sydney" },
        { label: "Melbourne (GMT+10/+11)", tz: "Australia/Melbourne" },
        { label: "Brisbane (GMT+10)", tz: "Australia/Brisbane" },
        { label: "Adelaide (GMT+9:30/+10:30)", tz: "Australia/Adelaide" },
        { label: "Perth (GMT+8)", tz: "Australia/Perth" },
        { label: "Auckland (GMT+12/+13)", tz: "Pacific/Auckland" },
        { label: "Wellington (GMT+12/+13)", tz: "Pacific/Auckland" },
        { label: "Fiji (GMT+12/+13)", tz: "Pacific/Fiji" },
    ],
    "Africa": [
        { label: "Cairo (GMT+2)", tz: "Africa/Cairo" },
        { label: "Johannesburg (GMT+2)", tz: "Africa/Johannesburg" },
        { label: "Cape Town (GMT+2)", tz: "Africa/Johannesburg" },
        { label: "Lagos (GMT+1)", tz: "Africa/Lagos" },
        { label: "Nairobi (GMT+3)", tz: "Africa/Nairobi" },
        { label: "Casablanca (GMT+0/+1)", tz: "Africa/Casablanca" },
        { label: "Algiers (GMT+1)", tz: "Africa/Algiers" },
        { label: "Tunis (GMT+1)", tz: "Africa/Tunis" },
        { label: "Addis Ababa (GMT+3)", tz: "Africa/Addis_Ababa" },
    ]
};

// Cached list of regions, so we can iterate them without touching the object.
const regionNames = Object.keys(zonesByRegion);

// Plugin‑wide settings. These are tweakable in the Vencord UI.
const settings = definePluginSettings({
    twentyFourHours: {
        type: OptionType.BOOLEAN,
        description: "24 hour time",
        default: false
    },
    showInMessage: {
        type: OptionType.BOOLEAN,
        description: "Show local time next to messages",
        default: true
    },
    showOffset: {
        type: OptionType.BOOLEAN,
        description: "Show GMT offset (e.g. GMT+2)",
        default: false
    },
    // Hidden backing store for per‑user timezones.
    storedTimezones: {
        type: OptionType.STRING,
        description: "",
        default: "{}",
        hidden: true
    }
});

// Formats a date as "what time is it for *this* user", respecting:
// - Their timezone (we stored it)
// - Your locale
// - Your 12h/24h preference (setting)
function formatUserTime(userId: string, date: Date, withDate = false): string | null {
    const tz = userTimezones[userId];
    if (!tz) return null;

    // Fallback to en-US if Discord doesn’t give us anything.
    const locale = Locale?.getLocale?.() ?? "en-US";

    const opts: Intl.DateTimeFormatOptions = withDate
        ? {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
            hour: "numeric",
            minute: "numeric"
        }
        : {
            hour: "numeric",
            minute: "numeric"
        };

    const fmt = new Intl.DateTimeFormat(locale, {
        ...opts,
        hourCycle: settings.store.twentyFourHours ? "h23" : "h12",
        timeZone: tz,
        // "shortOffset" gives nice things like "GMT+2" instead of huge names.
        timeZoneName: settings.store.showOffset ? "shortOffset" : undefined
    });

    return fmt.format(date);
}

export default definePlugin({
    name: "Timezones",
    description: "Allows you to display other users' local times.",
    authors: [{ name: "Bushido", id: 516002221809205249n }],

    settings,

    // Add style >:)
    styles: `
        .vc-timezones-tag {
            margin-left: 0.5rem;
            font-size: 0.75rem;
            line-height: 1.0rem;
            color: var(--text-muted);
            vertical-align: baseline;
            font-weight: 500;
        }
        [class*="compact"] .vc-timezones-tag {
            display: inline;
        }
    `,

    start() {
        loadTimezones();

        addMessageDecoration("Timezones", ({ message }) => {
            if (!settings.store.showInMessage) return null;
            if (!message?.author?.id) return null;

            const tz = userTimezones[message.author.id];
            if (!tz) return null;

            const timestamp = message.timestamp
                ? message.timestamp.toDate()
                : new Date();

            const short = formatUserTime(message.author.id, timestamp, false);
            const long = formatUserTime(message.author.id, timestamp, true);

            if (!short || !long) return null;

            return (
                <Tooltip text={`${long} (${tz})`}>
                    {props => <span {...props} className="vc-timezones-tag">({short})</span>}
                </Tooltip>
            );
        });
    },

    stop() {
        removeMessageDecoration("Timezones");
    },

    contextMenus: {
        "user-context"(children, { user }) {
            if (!user) return;

            const timezone = userTimezones[user.id];

            // Items that live under "Timezones" in the user context menu.
            const submenuItems: React.ReactNode[] = [];

            if (timezone) {
                // Just a read‑only reminder of what we currently stored.
                submenuItems.push(
                    <Menu.MenuItem
                        id="vc-tz-current"
                        label={`Timezone: ${timezone}`}
                        disabled={true}
                    />
                );
            }

            // Main entry to pick a timezone, grouped by region so users don't have to hunt too hard.
            submenuItems.push(
                <Menu.MenuItem
                    id="vc-tz-set"
                    label={timezone ? "Change Timezone" : "Set Timezone"}
                    children={regionNames.map(region => (
                        <Menu.MenuItem
                            id={`vc-tz-region-${region}`}
                            label={region}
                            children={zonesByRegion[region].map(zone => (
                                <Menu.MenuItem
                                    id={`vc-tz-${zone.tz}`}
                                    label={zone.label}
                                    action={() => {
                                        // One click and we remember this forever (or until cleared).
                                        userTimezones[user.id] = zone.tz;
                                        saveTimezones();
                                        console.log(
                                            `[Timezones] Set timezone for ${user.username} to ${zone.tz}`
                                        );
                                    }}
                                />
                            ))}
                        />
                    ))}
                />
            );

            // Escape hatch if you mis‑set or no longer care about the user’s timezone.
            submenuItems.push(
                <Menu.MenuItem
                    id="vc-tz-remove"
                    label="Remove Timezone"
                    disabled={!timezone}
                    action={() => {
                        delete userTimezones[user.id];
                        saveTimezones();
                        console.log(`[Timezones] Removed timezone for ${user.username}`);
                    }}
                />
            );

            // Finally, actually attach our "Timezones" group to the user context menu.
            children.push(
                <Menu.MenuSeparator />,
                <Menu.MenuItem
                    id="vc-tz-root"
                    label="Timezones"
                    children={submenuItems}
                />
            );
        }
    }
});
