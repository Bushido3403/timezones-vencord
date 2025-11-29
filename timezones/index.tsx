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

// Curated, human‑friendly timezones so users don’t have to scroll through 300+ cryptic IANA names.
const zonesByRegion: Record<string, TimezoneOption[]> = {
    "Americas": [
        { label: "New York (EST/EDT)", tz: "America/New_York" },
        { label: "Chicago (CST/CDT)", tz: "America/Chicago" },
        { label: "Denver (MST/MDT)", tz: "America/Denver" },
        { label: "Los Angeles (PST/PDT)", tz: "America/Los_Angeles" },
        { label: "Phoenix (MST)", tz: "America/Phoenix" },
        { label: "Anchorage (AKST/AKDT)", tz: "America/Anchorage" },
        { label: "Honolulu (HST)", tz: "Pacific/Honolulu" },
        { label: "Toronto", tz: "America/Toronto" },
        { label: "Mexico City", tz: "America/Mexico_City" },
        { label: "São Paulo", tz: "America/Sao_Paulo" },
        { label: "Buenos Aires", tz: "America/Argentina/Buenos_Aires" },
    ],
    "Europe": [
        { label: "London (GMT/BST)", tz: "Europe/London" },
        { label: "Paris (CET/CEST)", tz: "Europe/Paris" },
        { label: "Berlin", tz: "Europe/Berlin" },
        { label: "Amsterdam", tz: "Europe/Amsterdam" },
        { label: "Madrid", tz: "Europe/Madrid" },
        { label: "Rome", tz: "Europe/Rome" },
        { label: "Stockholm", tz: "Europe/Stockholm" },
        { label: "Moscow", tz: "Europe/Moscow" },
        { label: "Athens", tz: "Europe/Athens" },
        { label: "Istanbul", tz: "Europe/Istanbul" },
    ],
    "Asia": [
        { label: "Dubai", tz: "Asia/Dubai" },
        { label: "Mumbai", tz: "Asia/Kolkata" },
        { label: "Bangkok", tz: "Asia/Bangkok" },
        { label: "Singapore", tz: "Asia/Singapore" },
        { label: "Hong Kong", tz: "Asia/Hong_Kong" },
        { label: "Shanghai", tz: "Asia/Shanghai" },
        { label: "Tokyo", tz: "Asia/Tokyo" },
        { label: "Seoul", tz: "Asia/Seoul" },
        { label: "Manila", tz: "Asia/Manila" },
    ],
    "Oceania": [
        { label: "Sydney (AEST/AEDT)", tz: "Australia/Sydney" },
        { label: "Melbourne", tz: "Australia/Melbourne" },
        { label: "Brisbane", tz: "Australia/Brisbane" },
        { label: "Perth", tz: "Australia/Perth" },
        { label: "Auckland", tz: "Pacific/Auckland" },
    ],
    "Africa": [
        { label: "Cairo", tz: "Africa/Cairo" },
        { label: "Johannesburg", tz: "Africa/Johannesburg" },
        { label: "Lagos", tz: "Africa/Lagos" },
        { label: "Nairobi", tz: "Africa/Nairobi" },
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

    start() {
        // Load whatever timezones we previously saved.
        loadTimezones();

        // Inject a tiny stylesheet instead of fighting Discord’s classes everywhere.
        const style = document.createElement("style");
        style.id = "vc-timezones-style";
        style.textContent = `
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
        `;
        document.head.appendChild(style);

        // Add a little "local time" tag next to messages from users we have a timezone for.
        addMessageDecoration("Timezones", ({ message }) => {
            if (!settings.store.showInMessage) return null;
            if (!message?.author?.id) return null;

            const tz = userTimezones[message.author.id];
            if (!tz) return null;

            // Prefer Discord's message timestamp; worst case, use "now".
            const timestamp = message.timestamp
                ? new Date(message.timestamp)
                : new Date();

            const short = formatUserTime(message.author.id, timestamp, false);
            const long = formatUserTime(message.author.id, timestamp, true);

            if (!short || !long) return null;

            // Short label inline, full info on hover.
            return (
                <Tooltip text={`${long} (${tz})`}>
                    {props => <span {...props} className="vc-timezones-tag">({short})</span>}
                </Tooltip>
            );
        });
    },

    stop() {
        // Unhook message decorations and clean up our styles so we don’t leave junk behind when disabled.
        removeMessageDecoration("Timezones");

        const style = document.getElementById("vc-timezones-style");
        if (style) style.remove();
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
