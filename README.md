# Unofficial focusmate.com Scheduler

**Book three months of [focusmate.com](https://www.focusmate.com) sessions in
seconds, not hours.**

A Chrome extension for people who sit down at the same times every week.

![Booking a run of weeks](docs/booking.gif)

## Why

I do nine Focusmate sessions a day, at the same times, every day.

Focusmate can't repeat a booking. So every week I clicked the same grid again,
one session at a time, and every week I got something wrong or gave up halfway.

Now I get it done in seconds. I write my week down once and press a button.

If your week is different every time, you don't need this.

## How it works

Write your week in the grid. Up to 10 sessions a day, on Focusmate's 15-minute
steps, 25 / 50 / 75 minutes each. `copy →` copies a day into the next one.

![The weekly schedule grid](docs/schedule-grid.png)

Then click the weeks you want on the calendar - shift-click takes a whole run -
and press **Book**.

Sessions you already have are left alone. It only adds what's missing, and it
never double-books.

![The result of a run](docs/booking-result.png)

One rule worth knowing: Focusmate adds a break after every session, so a 25 / 50
/ 75 minute session actually blocks 30 / 60 / 90. The grid warns you as you type
if two sessions are too close.

The **Cancel** tab does the reverse: pick weeks, and it cancels everything in
them. That one can't be undone.

Your week is saved in the browser, so next time it's already there. Nothing
happens on its own - you always press the button.

## Install

It's not in the Chrome Web Store, so you download a folder and point Chrome at
it. Once, then never again.

1. Click the green **Code** button at the top of this page → **Download ZIP**.
2. Unzip it, and move the folder somewhere you won't delete it - Documents is
   fine. Chrome loads it from wherever it sits, so it can't live in Downloads.
3. Go to `chrome://extensions` (type that in the address bar).
4. Turn on **Developer mode**, top right.
5. Click **Load unpacked** and choose the `focusmate` folder - the one with
   `manifest.json` inside it.
6. Go to [app.focusmate.com](https://app.focusmate.com) and sign in.
7. Click the purple icon in your toolbar. If it's hidden, click the puzzle piece
   and pin it.

![The extension's icon in the Chrome toolbar](docs/toolbar-button.png)

Chrome will sometimes warn you about "developer mode extensions". That's its
standard warning for anything not from the Web Store, not a warning about this.

**To update:** download the new ZIP, replace the folder, and press reload on the
extension's card in `chrome://extensions`.

## Should you trust it?

No. Check it.

It's about 1,400 lines of plain JavaScript in six files. No build step, nothing
minified, no libraries. What you see here is exactly what runs, and
`focusmate/api.js` is the only file that touches the network.

Don't want to read code? Paste this into any AI chatbot:

```
Review this Chrome extension for me:
https://github.com/alchemicwebstudio/focusmate-scheduler

1. Can it see or send my password?
2. What leaves my browser, and to which websites?
3. Does anything go to the author, or to any tracking service?
4. Could it do anything to my Focusmate account besides book and cancel?
5. Does anything run on its own, without me clicking?

Read focusmate/api.js and focusmate/main.js, and quote the lines you're
basing each answer on.
```

If it answers without quoting lines, ignore the answer.

**What it does with your login:** it borrows the session your browser already
has with Focusmate - the same one the website uses - and sends it back to
Focusmate, only when you press a button. Nothing goes to me. There's no server,
no tracking, and your password is never involved. The only thing saved is your
weekly schedule, on your own computer.

**What no code review can tell you:** whether Focusmate minds. It uses the same
endpoint their website uses, as you, but it isn't official. Nobody can promise
you how they'd feel about it.

For what it's worth, booking this way asks *less* of their servers than clicking
does - 30 sessions go in one request, and the whole thing is paced. So:
flattered rather than flustered, I hope.

## Times

Everything is your computer's clock. `08:30` means 08:30 where you are.

Daylight saving is handled - book across a clock change and every session stays
at the same wall-clock time.

If you move to another time zone, sessions you already booked stay at the moment
they were booked, so they'll read differently. Book after you land.

## Licence

MIT - see [LICENSE](LICENSE).

Focusmate is a trademark of Focusmate, Inc. This project is not affiliated with,
endorsed by, or supported by Focusmate. I do love Focusmate a lot, though.
