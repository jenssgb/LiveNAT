# TeamSim Demo App – Architektur (v0.1)

## 0. Kurzbeschreibung
**TeamSim** ist eine Demo-App, die auf **zwei getrennten Azure VMs** läuft (VM A und VM B) und eine **Teams-Konversation simuliert**:
- VM A übernimmt **Sprecher A**, VM B übernimmt **Sprecher B**
- Ein Dialog-Script (2 Sprecher) wird turn-based abgespielt
- Die App erzeugt Audio via **Azure Speech Text-to-Speech (TTS)** und gibt es auf ein **Virtual Audio Cable** aus
- **Teams** nutzt das Virtual Cable als **Mikrofon**
- Steuerung: **Start / Pause / Stop**
- Verbindung der beiden Instanzen: **IP:Port** (WebSocket), inkl. Status/Heartbeat
- **Keyless**: OAuth/Managed Identity, **keine API Keys**
- **Setup vollständig durch die App** (Azure Services deployen + RBAC + lokale Checks)

---

## 1. Ziele und Nicht-Ziele

### Ziele (MVP)
- End-to-End Demo in Teams: **zwei synthetische Sprecher** sprechen im Meeting
- Stabiler Happy Path (1–2 Demos/Woche)
- Kein Geheimnis-Handling: **keine API Keys** in Config/Logs
- One-Click Setup auf frischer VM

### Nicht-Ziele (MVP)
- Eigener Virtual-Mic Treiber (SysVAD)
- Token-by-token Streaming TTS
- Mehr als 2 Sprecher oder parallele Meetings

---

## 2. Annahmen und Voraussetzungen
- Azure VMs + Netzwerk/NSG/VNet sind vorhanden (wird extern bereitgestellt)
- M365/Teams Tenant ist vorhanden (wird extern bereitgestellt)
- Teams Client ist auf beiden VMs installiert
- Auf beiden VMs ist ein **Virtual Audio Cable** installiert (z. B. VB-CABLE / VAC)
- Operator kann in Teams das Mikrofon auf das Virtual Cable umstellen

---

## 3. Systemkontext (High-Level)
TeamSim verändert Teams nicht. Die App:
1) generiert TTS-Audio,
2) spielt es in ein Virtual Audio Cable (Playback) aus,
3) Teams nimmt das Virtual Cable (Capture) als Mikrofon.

---

## 4. Komponentenübersicht

### 4.1 Pro VM (A und B)
- **Desktop Client**
  - UI (Wizard + Control Panel)
  - Script Manager (Load/Validate/Preview)
  - Orchestrator (State Machine, Turn-Taking, Timing)
  - Sync Layer (WebSocket)
  - TTS Adapter (Azure Speech)
  - Audio Output Engine (Ausgabe auf Virtual Cable Playback)

### 4.2 Azure (durch App deployed)
- **Azure Speech** (Text-to-Speech)
- Optional: **Azure OpenAI** (Text-Umschreibung/Polishing)
- **Managed Identity** der VM (System Assigned) + **RBAC** auf Speech/OpenAI

---

## 5. Architekturdiagramme

### 5.1 Systemdiagramm
```mermaid
flowchart LR
  subgraph VM_A["VM A"]
    AUI[Desktop UI]
    ASync[Sync WS]
    AOrch[Orchestrator]
    ATTS[TTS Adapter]
    AAudio[Audio Output -> Virtual Cable Playback]
    AUI --> AOrch
    AOrch <--> ASync
    AOrch --> ATTS --> AAudio
  end

  subgraph VM_B["VM B"]
    BUI[Desktop UI]
    BSync[Sync WS]
    BOrch[Orchestrator]
    BTTS[TTS Adapter]
    BAudio[Audio Output -> Virtual Cable Playback]
    BUI --> BOrch
    BOrch <--> BSync
    BOrch --> BTTS --> BAudio
  end

  ASync <--> BSync

  TeamsA[Teams Client A\nMic = Virtual Cable Capture] <-- Audio --> AAudio
  TeamsB[Teams Client B\nMic = Virtual Cable Capture] <-- Audio --> BAudio

  ATTS --> Speech[Azure Speech TTS]
  BTTS --> Speech
