# Campaign Calendar

Open **Calendar** in the DM's Toolkit, or click the date display above the hotbar. Every player sees the same current date and time and can open a read-only calendar of public events. Browsing months does not change campaign time. The Bound Almanac design matches the character sheet's ivory parchment, green leather, antique brass, and burgundy bookmarks.

The **Month** bookmark opens the full five-column calendar. Select a day or an event to open its **Agenda** details. The DM's **History** bookmark shows recent time changes. **Today** returns to the current month and day. Select **Clock**, to the right of **Time Controls**, to open the analogue clock in its own window. Players can also open it. It always shows current campaign time, even while browsing another month. Both hands update when game time changes; the hour hand includes the minutes and seconds. It does not advance with real-world time.

## Calendar definition

Every day has 24 hours. A week has five days, a month has six weeks (30 days), and a year has twelve months (360 days). There are no leap or extra festival days. Every month begins on Dawnday. Years are simple positive numbers.

Weekdays: **Dawnday, Forgeday, Wyrmday, Crownday, Veilday**.

Months, in order:

1. Frostveil
2. Emberwane
3. Thawborn
4. Rainweald
5. Thornbloom
6. Suncrest
7. Dragonflame
8. Goldfield
9. Harvestmere
10. Duskhollow
11. Ravenfall
12. Longnight

The initial date is **Crownday, Longnight 4, Year 742, 8:00 AM**. The active DM initializes a persistent anchor against the current Foundry world time once. Initializing or reloading does not advance/reset that clock or rewrite existing business timestamps.

## Time controls

The active DM can advance +10 minutes, +1 hour, +1 day, a custom duration in minutes/hours/days, or to a specific future fantasy date/time. Each advance stops at the earliest unacknowledged reminder. All reminders at that instant are grouped into one stop. The DM can acknowledge and continue toward the original target, or cancel the remaining advance. Another calendar advance cannot replace a pending one.

**Award Rest**, available in the calendar's bottom toolbar and the DM's Toolkit, asks for hours each time, defaulting to eight. The party character list is captured when rest begins. Reminder stops defer all healing and spell recovery. Continuing completes only the remaining duration; canceling retains elapsed time and grants no recovery. On completion, existing natural-healing eligibility and spell recovery rules apply. Plain **Rest** retains its previous behavior and does not advance the calendar.

Recovery progress and stable per-character operation identifiers are saved so a retry does not grant successful healing or spell recovery twice. If completion fails, the calendar retains an error and Retry Completion control. A rest whose recovery has started must finish recovery rather than be canceled partway through.

## Events

Select a day and choose **New event**. Only the active DM can create, edit, delete, or reset event reminders. Events default to **DM-only**. Public events and their reminders are visible to players; private events and reminder messages are restricted to DMs in the supported Foundry interface.

Each event has a title, optional plain-text description, visibility, fantasy start date, and type:

- **Timed:** A start time and optional later end time.
- **All day:** One or more whole days. The selected end day is inclusive; the stored end is the following midnight. The reminder is at 8:00 AM on the first day, regardless of the ignored time fields.

Events may repeat every positive number of days, five-day weeks, 30-day months, or 360-day years. Editing/deleting an event affects the whole series. Event-time reminders are always included. Optional earlier reminders are entered as comma-separated minutes, such as `60, 1440` for one hour and one day before. Earlier offsets for all-day events count backward from 8:00 AM. Acknowledgements belong to individual occurrence/offset pairs, so later repetitions still remind normally.

The month view shows ongoing events on each day they cover. The upcoming list includes current and future occurrences. Open an event from either view to inspect it; players receive read-only details.

## Corrections and history

Select **Time Controls** beside **New Event** in the top toolbar for custom durations, advancing to a date, and date corrections. Select **Time Controls** again to close the panel. Use **Upcoming** for future events and **History** to review recent changes. Corrections accept an optional reason. Forward corrections follow normal reminder stops. Backward corrections change the clock without reversing healing, spell recovery, purchases, bookings, or restocking. Acknowledged reminders remain acknowledged across corrections. **Reset reminders** explicitly clears an event's acknowledgements, allowing current/future occurrences to fire again.

A pending operation must be completed or canceled before correcting the date. The DM-only history displays the most recent 100 advances, rests, corrections, and cancellations with their old/new dates. Completed operation receipts remain available for deduplication.

## Integration and boundaries

Foundry's `game.time.worldTime` remains the sole elapsed-time clock. Inn/stable opening-hour checks interpret it through the same calendar anchor. Booking durations, booking expiry, and store/inn/stable replenishment retain their existing elapsed-time arithmetic and hooks. Inn booking end labels use the campaign calendar.

Calendar-controlled advances and Award Rest can stop before a reminder. Existing combat and third-party tools may independently advance Foundry time. Their updates refresh the displayed calendar and report crossed reminders, but cannot be stopped retroactively without undoing effects those tools may already have applied. This feature preserves existing combat behavior.

The first version does not automate torches, rations, spell duration, weather, or other resource consumption. It has no relationship to real elapsed time or whether Foundry is paused.

Only the anchor lives in a shared world setting. Events use JournalEntry documents with native ownership (public observer or DM-only); pending state, recovery progress, and history use a separate DM-only document. Private journal names are generic. These are Foundry's normal permissions and supported-interface privacy, not encryption against a modified or hostile client. Browser locks serialize mutations across same-origin DM tabs, alongside active-DM and revision checks; separate browsers using the same GM account should not drive the calendar concurrently.


## Moon phases and event categories

One moon follows a 30-day cycle aligned to the calendar months: new moon on the 1st and full moon on the 16th. The eight named phases progress through waxing crescent, first quarter, waxing gibbous, full moon, waning gibbous, last quarter and waning crescent before returning to new moon. Each day displays a phase symbol; hover for its phase and illumination. The phase beneath the current date always follows campaign time, even while browsing another month.

The DM can choose an event category: General, Market, Festival, Religious, Quest, or Deadline. Category icons appear with events in Month, Agenda and Upcoming. Existing uncategorized markets, festivals and religious holidays receive matching icons from their titles/descriptions. An explicit category overrides that inference. Categories do not affect visibility, recurrence, or reminders.


## Session notes and seasons

Open **Notes** to read dated session recaps. The active DM can create, edit or delete notes. New notes use the selected calendar day and default to **DM-only**; choose **Public** to share one with players. Notes have a title and up to 10,000 characters of plain text, with line breaks preserved. Notes for a selected day also appear in Agenda. Unsaved note drafts survive switching tabs and live calendar updates. Notes do not create events or reminders and do not advance time.

The season beside the moon phase follows the current campaign date, even when browsing a different month:

- **Winter:** Longnight, Frostveil, Emberwane.
- **Spring:** Thawborn, Rainweald, Thornbloom.
- **Summer:** Suncrest, Dragonflame, Goldfield.
- **Autumn:** Harvestmere, Duskhollow, Ravenfall.


## Multi-day event bars

Events covering more than one calendar day appear as continuous red-and-gold bars in Month. Bars wrap at the five-day week boundary and show continuation arrows when the event extends beyond the visible segment or month. Click any segment to open that occurrence's details. Single-day events remain text links with category icons.

Two event lanes keep dates and moon symbols visible. If more events overlap, **+N more** opens the selected day's Agenda with the complete event list. Public/private visibility follows the event. Timed events ending exactly at midnight do not occupy the following day; all-day end dates retain the editor's inclusive-day behavior.


## Weather

The **Weather** tab shows current conditions, Fahrenheit temperature, wind in mph, approximate visibility in miles, and a severity label: Fair, Minor, Moderate, Severe, or Extreme. Movement, travel, visibility and combat guidance is advisory; the DM decides how to apply it.

Weather follows eight three-hour periods per day and reproducible multi-day weather systems. Reloading, resting or correcting the calendar reveals the weather for that campaign period rather than rolling again. Weather does not change character statistics, advance time, create reminders, or stop a time advance.

Players see **current conditions and guidance only**. The DM also sees a private seven-day forecast (today plus six days), with each day expandable into eight periods. The current public snapshot contains no forecast, daily future high/low or generation seed. A private DM Journal stores the stable seed; the active DM publishes the current snapshot when campaign time changes. If no active DM has reconciled a new period yet, players see an awaiting-DM message instead of stale conditions.

The twelve fantasy months map to January–December. Temperature baselines interpolate the [National Weather Service Buffalo 1991–2020 climate normals](https://www.weather.gov/buf/newnormals). Seasonal precipitation and snow profiles inform a Buffalo-inspired generator, including winter thaws, spring snow, summer storms and lake-effect-style snow. Weather occurrence rates and intensity are game-model approximations, rather than a reproduction of measured annual precipitation totals.
