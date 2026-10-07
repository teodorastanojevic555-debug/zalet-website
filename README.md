# ZALET // High Velocity Motorsport Streetwear (zaletclub)

Independent motorsport streetwear brand e-commerce web platform engineered with raw brutalist aesthetics, modern Formula racing telemetry, and archive fashion editorial layout.

---

## 🏎️ Brand Aesthetic & Design System

- **Tone**: High-octane motorsport fusion, technical precision, raw brutalist streetwear, clean editorial layout inspired by Formula 1 paddock telemetry, 90s tarmac rally culture, and archive luxury streetwear.
- **Color Palette**:
  - `Deep Racing Black` (`#0A0A0A` / `#121212` / `#171717`)
  - `Crisp Off-White & Cream` (`#F5F5F5` / `#ECECEC`)
  - `High-Visibility Racing Orange` (`#FF4D00`) for CTA buttons, badge accents, and telemetry pulses
  - `Telemetry Green` (`#00FF66`) for live pit indicators
  - `Subdued Technical Grey` (`#1F1F1F` / `#2C2C2C` / `#E5E5E5`)
- **Typography**:
  - **Headers & Brand**: `'Syne'` and `'Michroma'` (Extended, bold geometric motorsport sans-serif)
  - **Body**: `'Inter'` (Clean editorial sans-serif)
  - **Telemetry, SKU, Sizes & Measurements**: `'Space Mono'` (Technical monospace)

---

## 🏁 Site Architecture & Features

1. **Top Telemetry Marquee Ticker**:
   - Live rolling announcement: `// DROP 01 LIVE // POST EXPRESS SRBIJA 24-48H // 240+ TO 460 GSM COMBED COTTON // RUN 01 OF 50 // DIRECT INSTAGRAM DM ORDERS @ZALETCLUB`.
2. **Sticky Header**:
   - Brand mark (`zalet` + `RACING CLUB` emblem).
   - Navigation links: `ARCHIVE / SHOP`, `SIZE GUIDE`, `MANIFESTO`, `ORDER & SHIPPING`.
   - Audio telemetry haptic toggle (synthesizes subtle mechanical clicks via Web Audio API).
   - Live Currency Switcher (`RSD` / `EUR`) with dynamic conversion across all cards, PDP, cart, and checkout.
   - Slide-out Cart Drawer trigger with animated item badge count.
   - Fullscreen mobile drawer for mobile devices.
3. **Hero Section**:
   - Bold banner: `"HIGH VELOCITY STREETWEAR // BORN ON THE TARMAC"`.
   - Dynamic motorsport grid overlay + subtle grain texture.
   - Live Belgrade GPS telemetry dashboard (`44.81°N 20.46°E`, track temperature, CET live clock).
   - Official brand visual showcase.
   - Primary CTAs: `EXPLORE DROP 01` & `VIEW MANIFESTO`.
4. **Product Catalog & Grid**:
   - Filter tabs: `ALL EDITIONS [5]`, `HEAVYWEIGHT TEES [2]`, `PADDOCK HOODIES [3]`.
   - Front & Back image hover swap effect on tees and hoodies.
   - Corner crosshair styling, edition badges (`LIMITED RUN // 50 PCS`, `260 GSM`, `IN STOCK`).
   - Quick Add size pills on card hover (`S`, `M`, `L`, `XL`, `XXL`).
   - Technical Spec / Quick View modal launch.
5. **Dedicated Product Detail Page (PDP) Experience**:
   - High-resolution interactive gallery with click-to-zoom and multi-angle thumbnails (Front, Back, Detail, Flatlay).
   - Dual pricing (`4,490 RSD` / `~€38.00`), stock count status.
   - Size selector and quantity counter.
   - Collapsible interactive accordions:
     - *01. Unisex Size Guide & Measurements* (with interactive measurement table in cm).
     - *02. Fabric & Care Instructions* (100% Combed Compact Cotton, pre-shrunk, reverse wash 30°C).
     - *03. Post Express Shipping & Returns* (24-48h domestic delivery, Pouzećem, DHL international).
   - Direct Instagram DM order button with pre-filled message generator.
6. **"About / Manifesto" Section**:
   - Brand narrative highlighting racing heritage and small-batch craftsmanship.
   - 3 Core Pillars: *Uncompromising Weight*, *Capped Numbered Runs*, and *Authentic Motorsport Telemetry*.
7. **Order & Support Flow**:
   - 3-step guide: Select Size, Post Express Dispatch, Pay via Pouzećem or Card.
   - Prominent VIP Instagram DM fallback banner: *"Prefer ordering via DM? Tap here to send your order on Instagram @zaletclub"*.
8. **Slide-Out Pit Bag (Cart Drawer)**:
   - Dynamic items list, quantity increase/decrease, item deletion.
   - Free shipping progress bar (Free Post Express over 8,000 RSD / €70).
   - Direct Checkout button & Send Bag to Instagram DM button.
9. **Fast Checkout Modal**:
   - Complete checkout form for domestic delivery across Serbia (Post Express Danas za Sutra / Paketomat) or DHL Express.
   - Payment method selection: Cash on Delivery (Pouzećem), Card, or Bank transfer.
   - Generates order reference code (`#ZL-XXXX`) with instant order confirmation receipt.
10. **Interactive Sizing Calculator Modal**:
    - Sliders for Height (cm) and Weight (kg) with real-time ZALET chassis size recommendation.
    - Full measurement charts for heavyweight tees and paddock hoodies.
11. **Minimalist Brutalist Footer**:
    - *"JOIN THE PADDOCK"* newsletter signup.
    - Social links (`@zaletclub` on Instagram).
    - Payment and courier badges (Post Express, Visa, Mastercard, DinaCard, Apple Pay).

---

## 📂 Project Structure

```
Zalet sajt/
├── index.html                   # Semantic HTML5 single page app
├── README.md                    # Project documentation
└── assets/
    ├── css/
    │   ├── style.css            # Core motorsport & brutalist design system
    │   └── telemetry.css        # HUD, animations, mobile drawer & telemetry dials
    ├── js/
    │   ├── products.js          # Product data, specs, sizing & telemetry data
    │   └── app.js               # State manager (Cart, Currency, Audio, PDP, Checkout)
    └── images/                  # Real brand product photos & crops
        ├── zalet-brand-hero.png
        ├── zalet-logo-orange.png
        ├── zalet-racing-emblem.png
        ├── carrera-tee-front.jpg
        ├── carrera-tee-back.jpg
        ├── carrera-tee-detail.jpg
        ├── carrera-tee-both.jpg
        ├── tarmac-hoodie-black.jpg
        ├── tarmac-hoodie-detail.jpg
        ├── flower-hoodie-model.jpg
        ├── flower-hoodie-detail.jpg
        ├── unlimited-hoodie-flat.jpg
        └── unlimited-hoodie-detail.jpg
```

---

## ⚡ How to Run

Simply open `index.html` in any modern web browser (Chrome, Safari, Firefox, Edge). No build step, Node.js, or external server dependencies required!
