# Phase 0 Baseline: 2-Node Network Setup & Range Test

> **For agentic workers:** This is a hardware/field operations plan. Each task is a physical or configuration action. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Flash, configure, and range-test two YELUFT ESP32 LoRa V3 915MHz radios as a functional 1-to-1 Meshtastic network.

**Architecture:** Both radios join the same private channel with a shared PSK. Radio 1 is your endpoint; Radio 2 is Micah's (or a second test node). Direct link — no relays. Range test uses Meshtastic's built-in Range Test plugin with one radio stationary and one mobile.

**Tech Stack:** Meshtastic firmware, flasher.meshtastic.org, Meshtastic mobile app (Android or iOS), USB-C cable for flashing.

---

## Part 1: Radio Setup

---

### Task 1: Flash Radio 1

> **Note:** The web flasher (flasher.meshtastic.org) did not work reliably on Windows — Chrome holds the COM port open and blocks esptool. Use the Python method below instead.

**What you need:** USB-C data cable (not charge-only), laptop with Python installed, Radio 1

- [ ] **Step 1: Install esptool and download firmware**

  Run once — skip if already done:
  ```bash
  pip install esptool
  ```

  Download the firmware (already done if you've flashed before — files are in `c:\dev\meshtastic`):
  ```bash
  gh release download v2.7.15.567b8ea --repo meshtastic/firmware --pattern "firmware-esp32s3-2.7.15.567b8ea.zip"
  unzip -o firmware-esp32s3-2.7.15.567b8ea.zip "firmware-heltec-v3-2.7.15.567b8ea.bin" "littlefs-heltec-v3-2.7.15.567b8ea.bin"
  ```

  Check for newer releases at: https://github.com/meshtastic/firmware/releases/latest

- [ ] **Step 2: Install the CP210x USB driver**

  The board uses a Silicon Labs CP210x chip. Windows needs the proper driver or the port won't work.
  Download and install from: https://www.silabs.com/developers/usb-to-uart-bridge-vcp-drivers
  (Click Downloads → CP210x Windows Drivers)

- [ ] **Step 3: Put the board in download mode**

  1. Hold **PRG** button (right button near USB-C port)
  2. Plug in the USB-C cable while holding PRG
  3. Release PRG after 2 seconds
  4. Display goes blank — board is in download mode

- [ ] **Step 4: Find the correct COM port**

  ```bash
  python -c "import serial.tools.list_ports; [print(p.device, p.description, p.hwid) for p in serial.tools.list_ports.comports()]"
  ```

  Look for **Silicon Labs CP210x** in the description. Note the COM port (e.g. COM5).

  > The board showed up as COM5 on first flash — COM3 was a phantom port that never worked.

- [ ] **Step 5: Flash**

  Replace `COM5` with your actual port:
  ```bash
  cd c:/dev/meshtastic
  python -m esptool --port COM5 --baud 115200 write-flash 0x0 firmware-heltec-v3-2.7.15.567b8ea.bin 0x3d0000 littlefs-heltec-v3-2.7.15.567b8ea.bin
  ```

  Expected output ends with:
  ```
  Verifying written data...
  Hash of data verified.
  Hard resetting via RTS pin...
  ```

- [ ] **Step 6: Verify**

  Board reboots automatically. Display should show:
  `Click to navigate` / `Long press to select`

  That's Meshtastic running successfully.

---

### Task 2: Configure Radio 1 via Meshtastic App

**What you need:** Phone with Meshtastic app installed (Android: Play Store / iOS: App Store), Bluetooth on

- [ ] **Step 1: Pair the radio**

  - Open Meshtastic app
  - Tap **"+"** or **"Connect"**
  - Select the device (it will appear as `Meshtastic_xxxxxx`)
  - Accept the pairing prompt

- [ ] **Step 2: Set region**

  - Go to **Radio Config → LoRa**
  - Set **Region: US** (this is US915)
  - Tap Save / Apply

- [ ] **Step 3: Set node name**

  - Go to **Radio Config → Device**
  - Set **Long Name:** `EP-VLG-01`
  - Set **Short Name:** `V01`
  - Tap Save / Apply

- [ ] **Step 4: Set node role**

  - In **Radio Config → Device**
  - Set **Role: CLIENT**
  - (CLIENT is correct for endpoint nodes — do not use ROUTER for personal radios yet)
  - Tap Save / Apply

- [ ] **Step 5: Create private channel**

  - Go to **Channels**
  - Tap the default channel (Channel 0 / LongFast)
  - Tap **Edit** or the pencil icon
  - Set **Name:** `OKC-CREW`
  - Set **PSK:** tap **Generate** to create a random key, then **copy and save this key somewhere safe** — you will need the exact same key for Radio 2
  - Set **Uplink/Downlink:** both OFF (no MQTT for now)
  - Tap Save / Apply

- [ ] **Step 6: Set approximate location**

  - Go to **Radio Config → Position**
  - Enable **GPS** (if the board has no GPS module, enable **Fixed Position**)
  - For fixed position: set lat/lon to your approximate address (no need to be exact — nearest intersection is fine)
  - Tap Save / Apply

- [ ] **Step 7: Verify config**

  Radio should reboot after saves. Reconnect and confirm:
  - Node name shows `EP-VLG-01` in the app
  - Channel shows `OKC-CREW`
  - Region shows US

---

### Task 3: Flash and Configure Radio 2

**What you need:** Radio 2, same laptop and phone setup as Task 1-2

- [ ] **Step 1: Flash Radio 2**

  Repeat Task 1 Steps 1–5 exactly for Radio 2. Same firmware, same board selection.

- [ ] **Step 2: Pair Radio 2 to app**

  Disconnect Radio 1 from the app first (or use a second phone). Pair Radio 2 via Bluetooth.

- [ ] **Step 3: Set region, name, and role**

  - Region: **US**
  - Long Name: `EP-VLG-02` (swap to `EP-MIC-01` when this becomes Micah's node)
  - Short Name: `V02`
  - Role: **CLIENT**

- [ ] **Step 4: Set the same private channel**

  - Go to **Channels → Channel 0**
  - Tap **Edit**
  - Name: `OKC-CREW`
  - PSK: **paste the exact key you saved from Radio 1** (do not generate a new one)
  - Tap Save / Apply

- [ ] **Step 5: Set approximate location**

  Same location as Radio 1 is fine for now — you are testing at the same address initially.

- [ ] **Step 6: Verify**

  Both radios are now on the same channel with the same PSK.

---

### Task 4: Validate Basic 2-Node Connectivity

**What you need:** Both radios powered and within ~5 feet of each other

- [ ] **Step 1: Check node list**

  Open the Meshtastic app connected to Radio 1. Go to **Nodes**. Radio 2 should appear in the list within 1–2 minutes.

  Expected: `EP-VLG-02` visible in node list with signal bars

- [ ] **Step 2: Send a test message from Radio 1**

  - Go to **Messages → Channel: OKC-CREW**
  - Type: `test 1 from V01`
  - Send

  Expected: message appears in chat with no error; Radio 2 (on second phone or after swapping) shows the message

- [ ] **Step 3: Send a test message from Radio 2**

  Swap to Radio 2 (reconnect second phone or swap the first phone's Bluetooth connection).

  - Type: `test 1 from V02`
  - Send

  Expected: Radio 1 receives the message

- [ ] **Step 4: Note RSSI and SNR at close range**

  In the app, tap on a received message or the node entry to see signal details.

  Record:
  ```
  Distance: ~5 feet (indoor, same room)
  RSSI: _____ dBm
  SNR:  _____ dB
  ```

  This is your baseline. All range test data is compared to this.

---

## Part 2: Range Testing

---

### Task 5: Enable Range Test Plugin

The Range Test plugin automatically sends timed messages with a counter. The receiving radio logs each one. This gives you a clean success/failure log without manual messaging.

**Set up the sender (Radio 1 — stays with you, mobile):**

- [ ] **Step 1: Enable Range Test on Radio 1**

  - Go to **Radio Config → Module Config → Range Test**
  - Set **Enabled: ON**
  - Set **Role: Sender**
  - Set **Send Interval: 60 seconds** (1 message per minute is enough for walking tests)
  - Tap Save / Apply

**Set up the receiver (Radio 2 — stays stationary at your home base):**

- [ ] **Step 2: Enable Range Test on Radio 2**

  - Go to **Radio Config → Module Config → Range Test**
  - Set **Enabled: ON**
  - Set **Role: Receiver** (or leave as default — it will log incoming range test packets automatically)
  - Tap Save / Apply

- [ ] **Step 3: Connect a phone to Radio 2 and leave it at home base**

  The phone connected to Radio 2 will log all received pings with RSSI/SNR. Keep this phone plugged in and the app open at your stationary location.

---

### Task 6: Conduct the Range Walk Test

**What you need:** Radio 1 (mobile, battery powered), phone connected to Radio 1, a second person at home base monitoring Radio 2 (or check logs afterward)

**Route:** Walk/drive from your location outward in the direction of Micah's place (east, toward 35.5625, -97.5472).

- [ ] **Step 1: Start at home base — confirm sender is transmitting**

  The Range Test sender will auto-transmit every 60 seconds once enabled. Confirm the first ping is received by Radio 2 before you leave.

  Log:
  ```
  Position: Home base (35.5609, -97.5564)
  Distance: 0 mi
  Packet received: YES / NO
  RSSI: ___ dBm  |  SNR: ___ dB
  ```

- [ ] **Step 2: Stop 1 — ~0.25 mi out**

  Walk or drive approximately 0.25 miles east. Wait for one ping to transmit and confirm receipt.

  Log:
  ```
  Position: _____________
  Distance: ~0.25 mi
  Packet received: YES / NO
  RSSI: ___ dBm  |  SNR: ___ dB
  ```

- [ ] **Step 3: Stop 2 — ~0.5 mi (Micah's distance)**

  This is the target link distance. Confirm this works reliably.

  Log:
  ```
  Position: _____________
  Distance: ~0.5 mi (Micah's approx location)
  Packet received: YES / NO
  RSSI: ___ dBm  |  SNR: ___ dB
  Notes (obstructions, elevation, etc.): ___
  ```

- [ ] **Step 4: Stop 3 — ~1 mi**

  Continue east past Micah's.

  Log:
  ```
  Position: _____________
  Distance: ~1 mi
  Packet received: YES / NO
  RSSI: ___ dBm  |  SNR: ___ dB
  ```

- [ ] **Step 5: Stop 4 — ~2 mi**

  Log:
  ```
  Position: _____________
  Distance: ~2 mi
  Packet received: YES / NO
  RSSI: ___ dBm  |  SNR: ___ dB
  ```

- [ ] **Step 6: Push to failure**

  Keep walking/driving until Radio 2 stops receiving pings for 3+ consecutive intervals. Note the last successful distance.

  Log:
  ```
  Last successful distance: ___ mi
  Approximate GPS: ___________
  Estimated obstructions: ___
  ```

---

### Task 7: Log and Interpret Results

- [ ] **Step 1: Pull the range test log from Radio 2**

  In the Meshtastic app connected to Radio 2, go to **Radio Config → Module Config → Range Test** and look for a saved log, or check the message history in the channel for auto-logged packets.

  If you have an SD card reader on the board: the range test log is saved as a CSV on the SD card (if SD is wired — YELUFT/Heltec V3 does not have SD by default, so app logs are your primary record).

- [ ] **Step 2: Record summary table**

  ```
  | Distance | RSSI (dBm) | SNR (dB) | Received? |
  |----------|-----------|----------|-----------|
  | 0 mi     |           |          |           |
  | 0.25 mi  |           |          |           |
  | 0.5 mi   |           |          |           |
  | 1 mi     |           |          |           |
  | 2 mi     |           |          |           |
  | Max      |           |          |           |
  ```

- [ ] **Step 3: Interpret results**

  Reference thresholds for LongFast at 915 MHz:
  - **RSSI > -110 dBm**: reliable link
  - **RSSI -110 to -120 dBm**: marginal, likely to drop packets
  - **RSSI < -120 dBm**: unreliable, relay required
  - **SNR > -10 dB**: good
  - **SNR < -15 dB**: weak

  Questions to answer:
  - Does the 0.5 mi Micah link work reliably? (Gate 1 check)
  - At what distance does signal become marginal?
  - Is a relay needed between you and Micah, or is direct link solid?

- [ ] **Step 4: Update the project plan with findings**

  Open [meshtastic-relay-project-plan.md](../meshtastic-relay-project-plan.md) and add a **Baseline Results** section with your summary table and the answer to: *does the You ↔ Micah direct link meet the 95% delivery threshold?*

---

## Reference: Signal Interpretation

| RSSI        | Meaning                        |
|-------------|--------------------------------|
| > -90 dBm   | Strong — excellent margin      |
| -90 to -100 | Good — reliable in most conditions |
| -100 to -110 | Fair — usable, watch for packet loss |
| -110 to -120 | Marginal — relay likely needed  |
| < -120 dBm  | Weak — unreliable without relay |

LongFast at US915 on Heltec V3 with stock antenna: typical reliable range is **1–3 miles** with clear line of sight, less in dense suburban/urban environments.

---

## Decision Gate (after Task 7)

| Outcome | Next Step |
|---------|-----------|
| 0.5 mi link works (RSSI > -110) | Gate 1 passed — configure Micah's node and hand off Radio 2 |
| 0.5 mi works but marginal | Gate 1 conditional — improve antenna placement before Micah handoff |
| 0.5 mi fails | Direct link insufficient — discuss relay option between you and Micah before handing off |
