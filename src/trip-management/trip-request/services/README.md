
Trip Request cutoff logic
-------------------HOURLY Example----------------

Configuration

hourly,4,24

Meaning

minimum =4 hours

maximum =24 hours

FOR EXAMPLE Now

10AM

Employee selects

1PM

Difference IS

3 hours

↓

Rejected.

Employee selects

6PM

Difference

8 hours

↓

Allowed.

Employee selects

Tomorrow 2PM

Difference

28 hours

↓

Rejected.

<!-- Notice your implementation uses the exact same algorithm for hourly and daily; only the configuration values differ. -->

--------------------WEEKLY Logic------------------

Configuration

weekly,wednesday,20:00,monday

Meaning

Week Starts

Monday

Cutoff Day

Wednesday

Cutoff Time

8 PM

Suppose today

Tuesday

Current week

Mon
Tue ← Today
Wed 8PM
Thu
Fri
Sat
Sun

Since current time is before Wednesday 8 PM

allowedWeekOffset =1

Allowed week

Next Week

Suppose next week

14 Jul
to

20 Jul

Employee can request

14
15
16
17
18
19
20

Everything else

↓

Rejected.

Now suppose today becomes

Thursday

Current week

Mon
Tue
Wed 8PM
Thu ← Today

Now

now > cutoff

Therefore

allowedWeekOffset=2

Allowed week shifts to the following week:

Week After Next

If next week is

14 Jul

Allowed becomes

21 Jul
to

27 Jul

So once the Wednesday 8 PM cutoff passes, users can no longer book the immediately upcoming week.

---------------MONTHLY Logic----------------

Configuration

monthly,28,20:00

Meaning

Every month

Cutoff

28th

8PM

Suppose today

20 July

Cutoff

28 July
8PM

Since today is before cutoff

Allowed Month

August

Employee can create

1 Aug

5 Aug

25 Aug

But cannot create

September

Now suppose today

29 July

Now

Current Date > Cutoff

Allowed month becomes

September

August requests are rejected because the cutoff has already passed.

The code also handles months that have fewer days than the configured cutoff day.

For example:

Config

monthly,31,20:00

February has only 28 days, so:

safeCutoffDay = Math.min(31, 28)

The cutoff automatically becomes February 28th at 8 PM.

-------------------Daily Logic ---------

Previous Day Cutoff → Employees can raise the trip request until the configured time on the previous day.
Same Day Cutoff → Employees can raise the trip request until the configured time on the same day.This value can't be later employees shift time .

In other words, after the cutoff time passes, booking is closed.

Pickup Example 1 (Previous Day)

Configuration

Mode            : Daily
Previous Day    : True
Same Day        : False
Time            : 07:00 PM

Employee wants a Pickup Trip for:

Trip Date : 15 July
Shift Time: 09:00 AM

The cutoff is:

14 July 07:00 PM

Timeline

14 Jul

03:00 PM   ✅ Allowed
06:59 PM   ✅ Allowed

07:00 PM   ❌ Booking Closed
08:00 PM   ❌ Not Allowed

--------------------------------

15 Jul

07:00 AM   ❌ Not Allowed
08:30 AM   ❌ Not Allowed

Employees can create tomorrow's pickup request only before 7:00 PM on the previous day.

Drop Example 1 (Previous Day)

Configuration

Mode            : Daily
Previous Day    : True
Same Day        : False
Time            : 08:00 PM

Employee wants a Drop Trip for

15 July
08:00 PM

Cutoff

14 July
08:00 PM

Timeline

14 Jul

01:00 PM   ✅ Allowed
05:30 PM   ✅ Allowed
07:59 PM   ✅ Allowed

08:00 PM   ❌ Booking Closed

09:00 PM   ❌ Not Allowed

----------------------------

15 Jul

10:00 AM   ❌ Not Allowed
06:00 PM   ❌ Not Allowed

Meaning:

Employees can create tomorrow's drop request only before 8:00 PM on the previous day.

For same day --------->
The effective cutoff should be whichever occurs first:

Configured cutoff time
Shift time

Mathematically,

Effective Cutoff = min(Configured Cutoff, Shift Time)
Example 1

Configuration

daily,sameday,09:00

Shift

08:00

Effective cutoff

min(09:00,08:00)

↓

08:00

Timeline

07:30  ✅ Allowed

07:59  ✅ Allowed

08:00  ❌ Closed

08:30  ❌ Closed

09:00  ❌ Closed

Example 2

Configuration

daily,sameday,11:00

Shift

10:30

Effective cutoff

10:30

because booking cannot continue after the shift begins.

To avoid ambiguity, I would also enforce that exactly one of these options is selected for a Daily configuration:

✅ Previous Day = True, Same Day = False
✅ Previous Day = False, Same Day = True
❌ Previous Day = True, Same Day = True
❌ Previous Day = False, Same Day = False

This ensures there is only one active cutoff rule to evaluate, making the implementation straightforward and avoiding conflicting configurations.

Daily → cannot request after the effective cutoff (and never after the shift time).
Hourly → cannot request after the shift time, even when lower/upper cutoffs are 0.