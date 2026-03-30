# Meshtastic Project Resources

## Local Planning Tool
- OKC relay planner (interactive map with pins and path solver): ../tools/okc-relay-planner.html
- Open this file in your browser, place rough friend pins, set max hop distance, and run Find Relay Path.

## Official Meshtastic Documentation
- Supported hardware overview: https://meshtastic.org/docs/hardware/
- Supported devices list: https://meshtastic.org/docs/hardware/devices/
- Device role and rebroadcast configuration: https://meshtastic.org/docs/configuration/radio/device/
- Firmware repository: https://github.com/meshtastic/firmware
- Firmware flashing docs hub: https://meshtastic.org/docs/getting-started/flashing-firmware/

## Device and Role Guidance (Most Relevant)
- Choosing among supported device families and radios: https://meshtastic.org/docs/hardware/devices/
- Device role details (CLIENT, ROUTER, ROUTER_LATE, REPEATER): https://meshtastic.org/docs/configuration/radio/device/

## 3D Printable Enclosure Sources
### Printables Search
- Meshtastic model search: https://www.printables.com/search/models?q=meshtastic

### Thingiverse Search
- Meshtastic model search: https://www.thingiverse.com/search?q=meshtastic&type=things

## Specific 3D Case Models Collected
### Printables
- Heltec v3 case for Meshtastic: https://www.printables.com/model/561389-heltec-v3-case-for-meshtastic
- H1 case for Heltec V3: https://www.printables.com/model/741974-h1-case-for-heltec-v3-running-meshtastic
- Heltec v3-mini case: https://www.printables.com/model/466818-heltec-v3-mini-case-for-meshtastic
- H2T case for Heltec T114: https://www.printables.com/model/982046-h2t-case-for-heltec-t114-with-gps-running-meshtast

### Thingiverse
- Heltec V3 OLED LoRa Case: https://www.thingiverse.com/thing:6254608
- RAK4631 Meshtastic Outdoor Node case: https://www.thingiverse.com/thing:6602076
- Meshtastic Router Build: https://www.thingiverse.com/thing:6483529
- TacMesh Waterproof Enclosure: https://www.thingiverse.com/thing:5923930

## Amazon and Shopping Research Links
These are useful for finding listings that explicitly mention frequency, but always verify exact band before purchase.

- Meshtastic 915 MHz search: https://www.amazon.com/s?k=meshtastic+915mhz
- Heltec V3 915 MHz search: https://www.amazon.com/s?k=heltec+v3+915mhz
- Meshtastic 868 MHz search: https://www.amazon.com/s?k=meshtastic+868mhz

Examples discussed during planning:
- 2 Sets Heltec ESP32 915MHz LoRa V3 (title includes 915MHz): https://www.amazon.com/ESP32-S3-Dual-core-Development-Meshtastic-Intelligent/dp/B0CW6151WJ
- 1 Pack ESP32 LoRa V3 with 915MHz antenna: https://www.amazon.com/YELUFT-Development-Integrated-Bluetooth-Meshtastic/dp/B0FT7WR12P
- DIYmalls 915MHz ESP32 LoRa 32 V3 pack: https://www.amazon.com/DIYmalls-Development-Antenna-Meshtastic-Compatible/dp/B0CW62KK5N

## Frequency and Region Reminders
- US and Canada: buy 915 MHz hardware and use US915 region settings
- Europe and UK: buy 868 MHz hardware and use EU868 region settings
- Antenna must match hardware frequency band

## Verification Checklist Before Buying Any Node
- Listing title explicitly includes 915MHz (for US project)
- Product details do not contradict the title
- Included antenna is 915 MHz or you buy a separate 915 MHz antenna
- Board version is supported by Meshtastic docs
- Seller listing has clear return path in case wrong band ships
