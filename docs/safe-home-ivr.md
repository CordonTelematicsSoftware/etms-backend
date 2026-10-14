The Safe Home IVR — the whole story
Vocabulary first

DTMF = Dual-Tone Multi-Frequency. The beep your phone makes when you press a key during a call. When Lancy presses 1, her phone sends a DTMF tone down the line.

Click-to-call = Smartflo's name for a server-initiated call. Originally built for a salesperson clicking a phone number on screen — hence the name. But it's just an API: you POST two numbers and Smartflo dials both and bridges them. Nobody clicks anything here. Your server calls it on a timer. The name is a leftover; ignore it.

DID = a phone number that belongs to your Smartflo account. You own two: 918069601600 and 918069601620.

The story of one call

Lancy gets out of the cab. The driver marks deboard with her PIN. Your code checks: is it night shift? Is she female? Yes to both — so it sets a timer.

The timer fires. Nobody clicked anything. scheduleSafeHomeIvrCheck waits, then checks: did she already confirm safe by PIN? No. So executeSafeHomeIVR runs.

Your server calls Smartflo's click-to-call API with:

agent_number: 7560845849 — her phone. This is the leg Smartflo dials first.
destination_number: 918069601620 — where the call goes after she answers.
caller_id: 918069601600 — what she sees on her screen.

So: three numbers, three jobs. Smartflo rings her phone showing 600 as the caller. That's cosmetic. When she picks up, Smartflo connects her to 620 — which is your own number, looping the call back into your Smartflo account. 620 is where the menu lives.

She answers. The call lands on DID 620. Smartflo looks at what 620 is configured to do: destination = API Dialplan "Test Dial Plan New".

Smartflo asks your server what to do. It POSTs to /ivr-call/safehome-prompt. Your server replies:

"Play recording 176050. While it plays, listen for exactly one digit, wait 6 seconds, retry once if silent. Then hand the call to dialplan 6a78183e429eed7c16513cef."

Part 1 — the handoff ID

Think of it as passing a baton.

Smartflo asks your server: "call's here, what now?"

Your server answers two instructions:

Play this recording, grab one digit.
Then go to dialplan 6a78...

Without instruction 2, Smartflo plays the recording, collects the digit… and has nowhere to send it. The digit dies there.

Instruction 2 points at a portal object you created ("SafeHome DTMF Capture TT"). That object's only job is: POST to /ivr-call/safehome-dtmf. So the digit reaches your server.

The ID is just the object's name in Smartflo's system. You copied it from the browser URL when you opened that dialplan.

Part 2 — "who is this call?"

When you placed the call, you saved a row with callID = "DR4-D9-1786287094.1041220".

When the digit arrives, Smartflo sends you call_id = "HYD3-D2-1786285694.683583". Different number. Same physical call, but the leg into 620 is tracked separately.

And the other fields don't help either:

call_to_number = 918069601620 → your own number
caller_id_number = 918069601600 → your own number

Nowhere in that payload is Lancy's phone number. So you can't tell whose call this is.

The workaround: your server takes that HYD3-D2-... id, asks Smartflo's /call/records API for the full call record, and that record does contain her number. Then it searches your history table for a pending SAFE_HOME row with that phone. Found → that's her row → update it.

That's resolveSafeHomeRecord. It's a lookup detour because Smartflo doesn't hand you the identity directly.

Your server figures out who this is. Tricky bit: this leg has a different call_id from the one you saved when placing the call, and caller_id_number is your own 600, not her number. So resolveSafeHomeRecord fetches the call record from Smartflo, pulls her number out of it, and matches the pending history row.

Then it acts. Digit 1 → handleSafeHomeConfirmed → TripRequest.safeHome = true + confirmation email. Digit 2 → handleSafeHomeEscalation → safeHome = false + Alert row + SOS websocket + alert email.

It replies "play recording 211631" — the thank-you. Call ends. If your server replied with nothing, Smartflo would treat it as a broken answer and bounce the call to the failover IVR, which replays the menu. That's the bug you saw at 11:56.

What if she doesn't answer?

Different path entirely. Smartflo's missed-call webhook fires — POST /ivr-call/safehome-missedcall-webhook → missedSafeHomeIVR. That method:

Marks the row Missed.
Counts missed rows for this trip request. Under 2? Call executeSafeHomeIVR again — a fresh call.
Already 2? Call handleSafeHomeEscalation(record, SAFE_HOME_NO_ANSWER_REMARKS, false) — same alert + email as "not safe", different remarks text.

So escalation has two entry points: safeHomeDtmfDialplan (she said no) and missedSafeHomeIVR (she never answered). Both land in the same handler.

