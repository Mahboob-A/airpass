# Airpass - Frontend UI/UX Design Flow 
**(Prepared for Google Stitch Gen-UI)**

## 1. Global UI Elements & Design Identity
- **Theme & Aesthetics:** Premium, minimal, glassmorphism-inspired design with a dual-tone "nature overlay" aesthetic. 
  - **Top/Main Background:** Soft, light pastel green (`#EBF3EA`) creating a clean, airy feel.
  - **Bottom/Ambient Background:** A warm, vibrant floral gradient (mixing sunset orange, warm pink, golden yellow, and lush green) glowing at the bottom of the viewport.
  - **Surfaces:** Stark glassmorphism (translucent white `rgba(255, 255, 255, 0.65)` with heavy backdrop-filter blur) to let the floral gradient and light green bleed through.
  - **Typography:** Deep forest green (`#1E3F20`) for high-contrast, elegant text.
  - **Primary Accents:** Vibrant leaf green (`#38A169`) for buttons and active states.
- **Top Navigation Bar:** 
  - Brand Logo (Airpass - Deep Forest Green).
  - Navigation Links: Home, About, Blog, GitHub. 
- **Persistent Global Elements:**
  - **Privacy Strip:** A persistent, sticky footer or small banner visible during transfers: *"🔗 Direct connection — the other party can see your IP address."*
- **Responsiveness:** Fluid grid, ensuring that everything from the File Drop Zone to the QR scanner is fully touch-optimized for mobile.

---

## 2. End-to-End Action Flow & Page Hierarchy

### 2.1 Home Page (The Landing View)
This page needs to be friction-less and drive immediate action.
- **Hero Section:** Clear tagline ("Privacy-First P2P File Transfer"). 
- **Sender Action (Primary):** 
  - Large **"Create Room"** button (Instant creation).
  - Optional toggle directly beneath: *"Protect with Password"*.
  - Optional toggle: *"Use relay-only (Maximum Anonymity)"*.
- **Receiver Action (Secondary):** 
  - Centered Input Field: "Enter 6-digit Code" (Auto-capitalizing, large typography).
  - "Join Room" button.

### 2.2 Room Page — Sender View
This screen manages the lifecycle of the actual file sending.
- **State 1: Waiting for Receiver**
  - **Large Display:** 6-Character Room Code (e.g., `X7K2P9`).
  - **Quick Share Actions:** Buttons for "Copy URL" and "Show QR Code" (Triggers a modal showing a scannable QR).
  - **Status Badge:** *Waiting for peer to join...*
- **State 2: Connected & File Selection**
  - **Status Badge:** *Peer Connected*.
  - **File Drop Zone:** A large, dashed-border area with smooth hover-opacity. Text: *"Drag & Drop a file here or browse"*.
- **State 3: Transferring**
  - **Visualizer:** A dynamic circular or linear progress bar.
  - **Metrics Dashboard:** 
    - Transfer Speed: `12.4 MB/s`
    - Time Remaining (ETA): `2 mins remaining`
    - Data Sent: `47.2 MB / 200 MB`
  - **Action:** A prominent, red "Cancel Transfer" button.
- **State 4: Complete**
  - Success checkmark animation.
  - Text: *"Transfer Complete"*.
  - Actions: "Send Another File" or "Close Room".

### 2.3 Room Page — Receiver View
This screen is what the person receiving the file sees.
- **State 1: Joining / Authentication**
  - If they join via URL and the room is password protected, a **Password Modal** overlays the screen: *"Enter Room Password to Decrypt"*.
- **State 2: Connected & File Preview**
  - **Status Badge:** *Waiting for sender to select a file...*
  - Once file is selected, show a **File Info Card**: Filename, File Size (e.g., 2.4 GB), and File Type Icon.
  - **Action:** "Accept & Download" or "Reject".
- **State 3: Transferring & Downloading**
  - Shows the same **Metrics Dashboard** as the sender (Progress Bar, Speed, ETA, Transferred Data).
  - **Action:** "Cancel Transfer".
- **State 4: Complete**
  - The Service Worker streams the chunks and the browser automatically prompts the save/download file dialog.
  - Text: *"File Received & Decrypted Successfully"*.
  - Actions: "Leave Room".

---

## 3. Modals, Errors & Edge Cases

- **Memory Limit Strategy Warning Modal (Receiver):**
  - Triggered if the receiver's browser doesn't support StreamSaver.js for large files.
  - **UI:** A centered modal alerting: *"Your browser doesn't support memory-efficient file downloads. For files over 1 GB, your browser may crash. We recommend using Chrome."*
  - **Actions:** "Proceed Anyway" (Danger) or "Cancel & Switch Browser" (Safe).
- **Invalid Room Code / Room Expired (Home/Join Page):**
  - **UI:** A soft toast notification or inline red error: *"Room X7K2P9 not found. It may have expired."*
- **Wrong Password (Receiver Password Modal):**
  - **UI:** Shake animation on the input field + red text *"Incorrect password, please try again."*
- **Connection Dropped (Sender & Receiver):**
  - **UI:** The screen grays out slightly, a banner drops down: *"Peer disconnected unexpectedly."*
  - **Actions:** "Return to Home".

---

## 4. Supplementary Pages

### 4.1 About Page
- **Mission Section:** Explain the "Zero-Knowledge" topology. Highlight how AES-256-GCM encryption works client-side.
- **Architecture Visual:** A graphic or grid showing traditional cloud sharing (Server in middle) vs. Airpass P2P sharing (Direct browser mapping).
- **Tech Stack Checklist:** Neat badges showing "React, FastAPI, WebRTC, Docker".

### 4.2 Blog Page
- **Hero:** "Latest Updates & Privacy News"
- **Grid Layout:** Clean masonry or 3-column grid of Blog Cards. 
- **Blog Card Anatomy:** High-quality thumbnail image, Tag (e.g., *Engineering*, *Privacy*), Title, 2-line excerpt, and *X min read* timestamp.
- **Article Reading View:** Very clean, centered typography (similar to Medium) with dark/light mode optimization for reading stamina.
