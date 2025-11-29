import { addMessageDecoration, removeMessageDecoration } from "@api/MessageDecorations";
import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";
import { findByPropsLazy } from "@webpack";
import { Menu, Tooltip, React } from "@webpack/common";

const Locale = findByPropsLazy("getLocale");

const STORAGE_KEY = "vencord-timezones";

type TimezoneMap = Record<string, string>;

let userTimezones: TimezoneMap = {};

function loadTimezones() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            userTimezones = JSON.parse(raw);
        }
    } catch (err) {
        console.warn("[Timezones] Failed to load stored timezones:", err);
        userTimezones = {};
    }
}

function saveTimezones() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(userTimezones));
    } catch (err) {
        console.warn("[Timezones] Failed to save timezones:", err);
    }
}

const allTimezones: string[] = (Intl as any).supportedValuesOf
    ? (Intl as any).supportedValuesOf("timeZone")
    : [];

interface TimezoneOption {
    label: string;
    tz: string;
}

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

const regionNames = Object.keys(zonesByRegion);

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
    }
});

function formatUserTime(userId: string, date: Date, withDate = false): string | null {
    const tz = userTimezones[userId];
    if (!tz) return null;

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
        loadTimezones();

        const style = document.createElement("style");
        style.id = "vc-timezones-style";
        style.textContent = `
            .vc-timezones-tag {
                margin-left: 0.5rem;
                font-size: 0.75rem;
                line-height: 1.375rem;
                color: var(--text-muted);
                vertical-align: baseline;
                font-weight: 500;
            }
            [class*="compact"] .vc-timezones-tag {
                display: inline;
            }
        `;
        document.head.appendChild(style);

        addMessageDecoration("Timezones", ({ message }) => {
            if (!settings.store.showInMessage) return null;
            if (!message?.author?.id) return null;

            const tz = userTimezones[message.author.id];
            if (!tz) return null;

            const timestamp = message.timestamp
                ? new Date(message.timestamp)
                : new Date();

            const short = formatUserTime(message.author.id, timestamp, false);
            const long = formatUserTime(message.author.id, timestamp, true);

            if (!short || !long) return null;

            return (
                <Tooltip text={`${long} (${tz})`}>
                    {props => <span {...props} className="vc-timezones-tag">{short} Local</span>}
                </Tooltip>
            );
        });
    },

    stop() {
        removeMessageDecoration("Timezones");

        const style = document.getElementById("vc-timezones-style");
        if (style) style.remove();
    },

    contextMenus: {
        "user-context"(children, { user }) {
            if (!user) return;

            const timezone = userTimezones[user.id];

            const submenuItems: React.ReactNode[] = [];

            if (timezone) {
                submenuItems.push(
                    <Menu.MenuItem
                        id="vc-tz-current"
                        label={`Timezone: ${timezone}`}
                        disabled={true}
                    />
                );
            }

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
