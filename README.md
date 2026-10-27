# Chelmer Challenge (Price Bailey test build)

Two-screen exhibition game. Players steer a Price Bailey river cruise boat down the River Chelmer, from Chelmsford city centre to Heybridge Basin. The big screen shows the game; a phone is the controller.

## Files
- `index.html`: big-screen game (open this on the stand display).
- `controller/index.html`: phone controller (opened by scanning the QR code).
- `lib/link.js`: connection between the two pages.
- `lib/peerjs.min.js`, `lib/qrcode.js`: bundled libraries (no CDN calls).
- `assets/logo.png`: TODO, add the approved Price Bailey logo here.

## Publish on GitHub Pages
1. Create a repo under `price-baileymarketing-star` and upload everything, keeping the folders.
2. Settings > Pages > Deploy from branch > `main` / root.
3. Open `https://price-baileymarketing-star.github.io/<repo>/` on the big screen.
4. Scan the QR code with a phone.

## Test at your desk without a phone
Open the game in one tab, then open the URL shown under the QR code in a second tab of the same browser. The tabs talk directly, no internet needed.

## How the link works
Phone and screen connect through the free PeerJS service (WebRTC). Both devices need internet. On the day, put the stand phone on 4G. If the link fails, the game still plays with arrow keys or mouse.

## Change things
- Brand colours: `:root` block at the top of both HTML files.
- Balance and copy: `CONFIG`, `GOOD`, `RISKS` in `index.html`.
- Form fields: `CONFIG` in `index.html` and `FORM` in `controller/index.html` (currently `wpf72332_23` and `wpf72332_31`).

## Before launch
- Confirm brand hex values and add the logo.
- Confirm `wpf72332_31` is the game URL field for this form.
- Test on venue wifi and on 4G.
