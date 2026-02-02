# Product Requirements Document: NDA Analyst Word Add-in

**Project Codename:** NDA Analyst for Word
**Version:** 1.0.0-draft
**Last Updated:** February 2, 2026
**Author:** Claude (AI Assistant)
**Status:** Research Complete — Pre-Implementation
**Parent PRD:** [NDA Analyst PRD](./PRD.md)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Problem Statement](#2-problem-statement)
3. [Goals and Non-Goals](#3-goals-and-non-goals)
4. [User Personas](#4-user-personas)
5. [User Stories](#5-user-stories)
6. [System Architecture Overview](#6-system-architecture-overview)
7. [Office.js API Capabilities](#7-officejs-api-capabilities)
8. [Authentication Architecture](#8-authentication-architecture)
9. [Feature Specifications](#9-feature-specifications)
10. [API Integration Design](#10-api-integration-design)
11. [UI/UX Requirements](#11-uiux-requirements)
12. [Manifest Configuration](#12-manifest-configuration)
13. [Development Environment](#13-development-environment)
14. [Deployment and Distribution](#14-deployment-and-distribution)
15. [Security and Compliance](#15-security-and-compliance)
16. [Testing Strategy](#16-testing-strategy)
17. [Performance Requirements](#17-performance-requirements)
18. [Cost Estimates](#18-cost-estimates)
19. [Milestones and Roadmap](#19-milestones-and-roadmap)
20. [Technical Decision Log](#20-technical-decision-log)
21. [Risks and Mitigations](#21-risks-and-mitigations)
22. [Competitive Analysis](#22-competitive-analysis)
23. [Open Questions](#23-open-questions)
24. [Appendices](#24-appendices)

---

## 1. Executive Summary

NDA Analyst for Word is a Microsoft Word Add-in that brings NDA analysis capabilities directly into the lawyer's native document editing environment. When a lawyer receives a contract from opposing counsel as a Word document, they can analyze it in-place without leaving Word, exporting, or uploading to a separate web interface.

The add-in leverages the existing NDA Analyst backend infrastructure (Inngest pipelines, Claude API, Voyage AI embeddings, CUAD dataset) while providing a Word-native experience with content controls for clause marking, synchronized scrolling for clause navigation, and real-time progress updates during analysis.

### Core Value Proposition

**Receive an NDA in Word. Click "Analyze." Get clause-by-clause risk assessment with cited evidence—without ever leaving Microsoft Word.**

### Strategic Positioning

This add-in transforms NDA Analyst from a standalone web tool into an integrated workflow solution. Lawyers spend 60%+ of their contract review time in Word; meeting them there reduces friction, increases adoption, and differentiates NDA Analyst from competitors that require document upload to separate platforms.

---

## 2. Problem Statement

### Primary Problem

Lawyers receive NDAs from opposing counsel as Microsoft Word documents (.docx). Their current workflow for using NDA Analyst requires:

1. Save the Word document locally
2. Open NDA Analyst web interface in browser
3. Upload the document
4. Wait for analysis
5. View results in browser while switching back to Word to understand context
6. Manually cross-reference analysis results with document sections

This context-switching workflow is friction-heavy and breaks the lawyer's concentration. When reviewing 20+ NDAs per week, this overhead compounds significantly.

### Secondary Problems

**For Sarah (In-House Counsel):**
- Cannot see risk annotations directly on the document she'll be redlining
- Must maintain mental model of which clauses map to which analysis results
- Loses the ability to make inline edits while viewing risk assessment
- Cannot quickly share annotated documents with colleagues in her Word-centric workflow

**For Alex (Startup Founder):**
- The separate upload step feels like unnecessary work for a "quick check"
- Prefers tools that integrate into existing workflows (Word, Google Docs)
- May not complete the analysis if the friction is too high

**For Law Firm IT:**
- Cannot easily deploy the tool to all attorneys
- Prefers Microsoft-approved add-ins from AppSource or centralized deployment
- Needs audit logging and enterprise authentication

---

## 3. Goals and Non-Goals

### Goals (MVP — Phase 1-2)

1. **Zero-export analysis:** Analyze the currently open Word document without saving or uploading separately
2. **In-document visualization:** Mark clauses with color-coded content controls indicating risk level
3. **Task pane results:** Display full analysis results (clauses, risk scores, gaps) in a persistent side panel
4. **Click-to-navigate:** Click any clause in task pane to scroll to and highlight it in the document
5. **Real-time progress:** Show analysis progress with stage indicators (parsing, classifying, scoring)
6. **Enterprise authentication:** Support Azure AD SSO for seamless enterprise login
7. **Fallback authentication:** Support dialog-based OAuth for non-enterprise users
8. **Cross-platform support:** Work on Word for Windows, Mac, and Word Online

### Goals (Post-MVP — Phase 3-4)

1. **Comparison mode:** Compare current document against a template or previously analyzed NDA
2. **Inline annotations:** Use Word's Annotations API for inline risk callouts with suggestions
3. **Ribbon integration:** Add dedicated ribbon tab with analysis commands
4. **Batch analysis:** Queue multiple open documents for sequential analysis
5. **Offline caching:** Store previous analysis results for offline review
6. **AppSource listing:** Publish to Microsoft's public marketplace

### Non-Goals

- **Document generation within Word:** Use the web interface for NDA generation (different workflow)
- **Real-time collaboration:** No multi-user concurrent editing of analyses
- **Document modification:** The add-in reads and annotates but does not modify contract text
- **Non-Word formats:** No support for PDF analysis within Word (use web interface)
- **Mobile Word apps:** Limited support on iOS/Android (task pane only, no content controls)
- **Legacy Office versions:** Minimum requirement is Office 2019 or Microsoft 365

---

## 4. User Personas

### Primary: Sarah — In-House Counsel (Enhanced from Parent PRD)

Sarah reviews 20+ NDAs per month, primarily received as Word documents from opposing counsel. Her workflow is Word-centric: she redlines in Word, shares via Word, and archives Word files.

**Current Pain:**
- Opens NDA Analyst web interface → uploads DOCX → views results → switches back to Word → tries to remember which clause was flagged → manually adds comments

**With Word Add-in:**
- Opens NDA in Word → clicks "Analyze" in ribbon → sees risk-highlighted clauses directly in document → clicks clause in task pane → document scrolls to clause → adds her own redline right there

**Key Requirements:**
- Must integrate into her existing Word workflow, not replace it
- Needs to see analysis results alongside the document, not in a separate window
- Wants to share annotated documents with colleagues who don't have NDA Analyst

### Secondary: Michael — BigLaw Associate

Michael works at a large law firm with strict IT policies. All software must be deployed via Microsoft's centralized deployment or approved through AppSource. He cannot install random browser extensions or desktop applications.

**Current Pain:**
- Firm doesn't allow third-party web apps for sensitive client documents
- Must request IT approval for any new tool, which takes weeks
- Often just does manual review rather than fighting the approval process

**With Word Add-in:**
- IT can deploy via Microsoft 365 Admin Center with one click
- Authentication uses existing Azure AD/Entra credentials
- Documents never leave the firm's environment (sent to NDA Analyst API, but not stored in third-party cloud storage the firm doesn't control)

**Key Requirements:**
- Must be deployable via centralized deployment
- Must use Azure AD SSO
- Must have audit logging for compliance
- Must meet firm's security review requirements

### Tertiary: Alex — Startup Founder (Enhanced from Parent PRD)

Alex receives NDAs occasionally (2-3 per month) and wants a quick sanity check. He's not a power user but wants minimal friction.

**With Word Add-in:**
- Receives NDA as email attachment → opens in Word → notices "NDA Analyst" tab → clicks "Analyze" → gets results in 60 seconds → makes informed decision

**Key Requirements:**
- Must be discoverable (ribbon tab, not hidden in menus)
- Must work without enterprise infrastructure (dialog-based auth fallback)
- Must feel fast and lightweight

---

## 5. User Stories

### Core Analysis Flow

| ID | Story | Priority | Acceptance Criteria |
|----|-------|----------|---------------------|
| WA-001 | As a lawyer, I can analyze the currently open Word document without exporting it | P0 | Click "Analyze" → document text extracted → analysis begins |
| WA-002 | As a lawyer, I can see analysis progress in real-time | P0 | Task pane shows: Parsing → Classifying → Scoring → Complete with progress % |
| WA-003 | As a lawyer, I can see extracted clauses with risk levels in a task pane | P0 | List view with clause name, risk badge (color-coded), confidence % |
| WA-004 | As a lawyer, I can click a clause to navigate to its location in the document | P0 | Click clause → document scrolls → clause text is highlighted |
| WA-005 | As a lawyer, I can see risk explanations with cited evidence for each clause | P0 | Expand clause → see explanation + "87% of NDAs have shorter duration" |
| WA-006 | As a lawyer, I can see which standard clauses are missing from the document | P0 | Gap analysis section shows missing categories with importance |
| WA-007 | As a lawyer, I see the overall risk score prominently displayed | P0 | Risk gauge/meter at top of task pane: "Cautious" with score |

### Document Interaction

| ID | Story | Priority | Acceptance Criteria |
|----|-------|----------|---------------------|
| WA-008 | As a lawyer, I can see content controls marking each identified clause | P1 | Color-coded boxes around clause text in document |
| WA-009 | As a lawyer, I can hover over a content control to see quick risk info | P1 | Tooltip shows: "Non-Compete · Aggressive · 92nd percentile duration" |
| WA-010 | As a lawyer, content controls persist after I close/reopen the document | P2 | Reopening analyzed document shows saved content controls |
| WA-011 | As a lawyer, I can clear all content controls added by NDA Analyst | P1 | "Clear Annotations" button removes all NDA Analyst markers |

### Authentication

| ID | Story | Priority | Acceptance Criteria |
|----|-------|----------|---------------------|
| WA-012 | As an enterprise user, I am automatically signed in via my Office credentials | P0 | SSO using Office's Azure AD session |
| WA-013 | As a non-enterprise user, I can sign in via a popup dialog | P0 | Click "Sign In" → dialog opens → Google/GitHub OAuth → token returned |
| WA-014 | As a user, my session persists across Word restarts | P1 | Token stored securely, refreshed automatically |
| WA-015 | As a user, I can sign out and switch accounts | P1 | "Sign Out" in settings → clears session |

### Ribbon Integration

| ID | Story | Priority | Acceptance Criteria |
|----|-------|----------|---------------------|
| WA-016 | As a user, I see an "NDA Analyst" tab in the Word ribbon | P1 | Custom ribbon tab with analysis commands |
| WA-017 | As a user, I can click "Analyze NDA" in the ribbon to start analysis | P1 | Single-click analysis initiation |
| WA-018 | As a user, I can click "Show Task Pane" if I closed it | P1 | Toggle task pane visibility |
| WA-019 | As a user, I can access settings from the ribbon | P2 | Settings gear → preferences dialog |

### Comparison (Post-MVP)

| ID | Story | Priority | Acceptance Criteria |
|----|-------|----------|---------------------|
| WA-020 | As a lawyer, I can compare the current document against a Bonterms template | P2 | Select "Compare" → choose template → see clause alignment |
| WA-021 | As a lawyer, I can compare the current document against a previously analyzed NDA | P2 | Select comparison → task pane shows side-by-side analysis |

### Error Handling

| ID | Story | Priority | Acceptance Criteria |
|----|-------|----------|---------------------|
| WA-022 | As a user, I see a clear error message if analysis fails | P0 | "Analysis failed: [reason]. Click to retry." |
| WA-023 | As a user, I can retry a failed analysis | P0 | "Retry" button restarts from failed step |
| WA-024 | As a user, I see an offline indicator if I lose network connectivity | P1 | "Offline - Analysis requires internet connection" |

---

## 6. System Architecture Overview

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Microsoft Word                                     │
│  ┌───────────────────────────────────────┐ ┌──────────────────────────────┐ │
│  │          Document Content              │ │       Task Pane Add-in       │ │
│  │                                        │ │  ┌──────────────────────────┐│ │
│  │  ┌──────────────────────────────────┐ │ │  │    React Application     ││ │
│  │  │  Content Controls (Clause Markers)│ │ │  │    (TypeScript)          ││ │
│  │  │  - Color-coded by risk level      │◄├─┤  │                          ││ │
│  │  │  - Tagged with clause ID          │ │ │  │  ┌────────────────────┐  ││ │
│  │  └──────────────────────────────────┘ │ │  │  │   Office.js API    │  ││ │
│  │                                        │ │  │  └────────────────────┘  ││ │
│  │  ┌──────────────────────────────────┐ │ │  │  ┌────────────────────┐  ││ │
│  │  │  Annotations (Phase 3)            │ │ │  │  │  API Client        │  ││ │
│  │  │  - Inline critiques with popups   │ │ │  │  └────────────────────┘  ││ │
│  │  └──────────────────────────────────┘ │ │  └──────────────────────────┘│ │
│  └───────────────────────────────────────┘ └──────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ HTTPS
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         NDA Analyst Backend (Vercel)                         │
│                                                                             │
│  ┌─────────────────────────┐  ┌─────────────────────────────────────────┐  │
│  │  Word Add-in API Routes │  │           Existing Infrastructure        │  │
│  │                         │  │                                         │  │
│  │  POST /api/word-addin/  │  │  ┌───────────────────────────────────┐  │  │
│  │       analyze           │──┼─▶│        Inngest Pipeline            │  │  │
│  │  GET  /api/word-addin/  │  │  │  Parser → Classifier → Scorer     │  │  │
│  │       status/:id        │  │  └───────────────────────────────────┘  │  │
│  │  GET  /api/word-addin/  │  │                    │                    │  │
│  │       results/:id       │  │                    ▼                    │  │
│  │  POST /api/word-addin/  │  │  ┌───────────────────────────────────┐  │  │
│  │       auth/exchange     │  │  │          Claude API               │  │  │
│  │                         │  │  │   (Clause classification/risk)    │  │  │
│  └─────────────────────────┘  │  └───────────────────────────────────┘  │  │
│                               │                    │                    │  │
│  ┌─────────────────────────┐  │                    ▼                    │  │
│  │  Auth Routes            │  │  ┌───────────────────────────────────┐  │  │
│  │  (Dialog callback)      │  │  │        Voyage AI Embeddings       │  │  │
│  └─────────────────────────┘  │  └───────────────────────────────────┘  │  │
│                               │                    │                    │  │
│                               │                    ▼                    │  │
│                               │  ┌───────────────────────────────────┐  │  │
│                               │  │     Neon PostgreSQL + pgvector    │  │  │
│                               │  │  (Reference data + tenant data)   │  │  │
│                               │  └───────────────────────────────────┘  │  │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Component Breakdown

| Component | Technology | Responsibility |
|-----------|------------|----------------|
| Task Pane | React 18 + TypeScript | User interface, state management, API calls |
| Office.js Bridge | @types/office-js | Document read/write, content controls, navigation |
| API Client | fetch + EventSource | Backend communication, SSE for progress |
| Auth Module | OfficeRuntime.auth + Dialog API | SSO and fallback authentication |
| State Management | Zustand | Client-side analysis state, UI state |
| Backend API | Next.js API Routes | Word-specific endpoints, auth exchange |
| Analysis Pipeline | Inngest (existing) | Document processing, agent orchestration |

### Data Flow: Analyze Document

```
┌─────────────┐     ┌──────────────┐     ┌───────────────┐     ┌──────────────┐
│   User      │     │  Task Pane   │     │    Backend    │     │   Inngest    │
│   Click     │     │   (React)    │     │  (Next.js)    │     │  Pipeline    │
└──────┬──────┘     └──────┬───────┘     └───────┬───────┘     └──────┬───────┘
       │                   │                     │                     │
       │  1. Click         │                     │                     │
       │  "Analyze"        │                     │                     │
       │──────────────────▶│                     │                     │
       │                   │                     │                     │
       │                   │  2. Extract text    │                     │
       │                   │  via Office.js      │                     │
       │                   │──────┐              │                     │
       │                   │      │ Word.run()   │                     │
       │                   │◀─────┘              │                     │
       │                   │                     │                     │
       │                   │  3. POST /analyze   │                     │
       │                   │  { text, metadata } │                     │
       │                   │────────────────────▶│                     │
       │                   │                     │                     │
       │                   │                     │  4. Trigger event   │
       │                   │                     │  nda/analyze        │
       │                   │                     │────────────────────▶│
       │                   │                     │                     │
       │                   │  5. Return          │                     │
       │                   │  { analysisId }     │                     │
       │                   │◀────────────────────│                     │
       │                   │                     │                     │
       │                   │  6. Subscribe SSE   │                     │
       │                   │  /status/:id        │                     │
       │                   │────────────────────▶│                     │
       │                   │                     │                     │
       │  7. Update        │  8. Progress events │  9. Step updates    │
       │  progress UI      │◀────────────────────│◀────────────────────│
       │◀──────────────────│                     │                     │
       │                   │                     │                     │
       │                   │  10. GET /results   │                     │
       │                   │────────────────────▶│                     │
       │                   │                     │                     │
       │                   │  11. Full results   │                     │
       │                   │◀────────────────────│                     │
       │                   │                     │                     │
       │  12. Render       │  13. Insert content │                     │
       │  results +        │  controls via       │                     │
       │  mark doc         │  Office.js          │                     │
       │◀──────────────────│──────┐              │                     │
       │                   │      │ Word.run()   │                     │
       │                   │◀─────┘              │                     │
       │                   │                     │                     │
       ▼                   ▼                     ▼                     ▼
```

---

## 7. Office.js API Capabilities

### 7.1 Document Content Access

#### Reading Document Text

```typescript
// Extract full document content for analysis
async function extractDocumentContent(): Promise<DocumentContent> {
  return Word.run(async (context) => {
    const body = context.document.body;
    const paragraphs = body.paragraphs;

    // Load text and structural information
    body.load("text");
    paragraphs.load("items");

    await context.sync();

    // Extract paragraph-level structure
    const structuredParagraphs: ParagraphData[] = [];

    for (const para of paragraphs.items) {
      para.load("text, style, font/bold, font/size, outlineLevel");
      await context.sync();

      structuredParagraphs.push({
        text: para.text,
        style: para.style,
        isHeading: para.style?.startsWith("Heading") || para.outlineLevel > 0,
        fontSize: para.font.size,
        isBold: para.font.bold
      });
    }

    return {
      fullText: body.text,
      paragraphs: structuredParagraphs,
      wordCount: body.text.split(/\s+/).length,
      extractedAt: new Date().toISOString()
    };
  });
}
```

#### Reading Document Metadata

```typescript
async function getDocumentMetadata(): Promise<DocumentMetadata> {
  return Word.run(async (context) => {
    const properties = context.document.properties;
    properties.load("title, author, creationDate, lastModifiedBy, subject");

    await context.sync();

    return {
      title: properties.title || "Untitled NDA",
      author: properties.author,
      createdAt: properties.creationDate,
      modifiedBy: properties.lastModifiedBy,
      subject: properties.subject
    };
  });
}
```

### 7.2 Content Controls for Clause Marking

Content controls are the primary mechanism for marking identified clauses:

```typescript
interface ClauseMarker {
  clauseId: string;
  category: string;
  riskLevel: "standard" | "cautious" | "aggressive" | "unknown";
  startIndex: number;
  endIndex: number;
  text: string;
}

async function markClause(marker: ClauseMarker): Promise<void> {
  await Word.run(async (context) => {
    const body = context.document.body;

    // Search for the clause text
    const searchResults = body.search(marker.text, {
      matchCase: true,
      matchWholeWord: false
    });
    searchResults.load("items");
    await context.sync();

    if (searchResults.items.length === 0) {
      console.warn(`Clause text not found: ${marker.text.substring(0, 50)}...`);
      return;
    }

    // Take the first match (or use position-based matching for accuracy)
    const range = searchResults.items[0];

    // Insert content control around the clause
    const contentControl = range.insertContentControl();
    contentControl.tag = `nda-analyst:${marker.clauseId}`;
    contentControl.title = marker.category;
    contentControl.appearance = Word.ContentControlAppearance.boundingBox;
    contentControl.color = getRiskColor(marker.riskLevel);
    contentControl.cannotDelete = false;  // Allow user to remove
    contentControl.cannotEdit = false;    // Allow user to edit text

    await context.sync();
  });
}

function getRiskColor(level: ClauseMarker["riskLevel"]): string {
  switch (level) {
    case "aggressive": return "#ef4444";  // Red
    case "cautious": return "#f59e0b";    // Amber
    case "standard": return "#22c55e";    // Green
    case "unknown": return "#6b7280";     // Gray
  }
}
```

#### Navigating to a Clause

```typescript
async function navigateToClause(clauseId: string): Promise<void> {
  await Word.run(async (context) => {
    const contentControls = context.document.contentControls;
    contentControls.load("items");
    await context.sync();

    // Find the content control with matching tag
    const control = contentControls.items.find(
      c => c.tag === `nda-analyst:${clauseId}`
    );

    if (control) {
      control.select(Word.SelectionMode.select);
      await context.sync();
    }
  });
}
```

#### Clearing All Markers

```typescript
async function clearAllNDAAnalystMarkers(): Promise<number> {
  return Word.run(async (context) => {
    const contentControls = context.document.contentControls;
    contentControls.load("items");
    await context.sync();

    let removedCount = 0;
    for (const control of contentControls.items) {
      if (control.tag?.startsWith("nda-analyst:")) {
        control.delete(false);  // Keep content, remove control
        removedCount++;
      }
    }

    await context.sync();
    return removedCount;
  });
}
```

### 7.3 Annotations API (Preview Feature)

The Annotations API provides inline critiques with popup suggestions:

```typescript
interface RiskAnnotation {
  clauseId: string;
  colorScheme: Word.CritiqueColorScheme;
  paragraphIndex: number;
  startOffset: number;
  length: number;
  suggestions: string[];
}

async function insertRiskAnnotations(annotations: RiskAnnotation[]): Promise<void> {
  await Word.run(async (context) => {
    const paragraphs = context.document.body.paragraphs;
    paragraphs.load("items");
    await context.sync();

    for (const annotation of annotations) {
      if (annotation.paragraphIndex >= paragraphs.items.length) continue;

      const paragraph = paragraphs.items[annotation.paragraphIndex];

      const critique: Word.Critique = {
        colorScheme: annotation.colorScheme,
        start: annotation.startOffset,
        length: annotation.length,
        popupOptions: {
          brandingTextResourceId: "NDA.Analyst.Brand",
          titleResourceId: "NDA.Analyst.RiskTitle",
          subtitleResourceId: "NDA.Analyst.RiskSubtitle",
          suggestions: annotation.suggestions
        }
      };

      paragraph.insertAnnotations({ critiques: [critique] });
    }

    await context.sync();
  });
}

function mapRiskToColorScheme(level: string): Word.CritiqueColorScheme {
  switch (level) {
    case "aggressive": return Word.CritiqueColorScheme.red;
    case "cautious": return Word.CritiqueColorScheme.lavender;
    case "standard": return Word.CritiqueColorScheme.green;
    default: return Word.CritiqueColorScheme.blue;
  }
}
```

### 7.4 OOXML Access for Advanced Scenarios

For complex document parsing (tables, nested structures):

```typescript
async function getDocumentOOXML(): Promise<string> {
  return Word.run(async (context) => {
    const body = context.document.body;
    const ooxml = body.getOoxml();
    await context.sync();
    return ooxml.value;
  });
}

// Parse OOXML to extract tables, which may contain contractual terms
function parseTablesFromOOXML(ooxml: string): TableData[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(ooxml, "text/xml");
  const tables: TableData[] = [];

  const tblElements = doc.getElementsByTagName("w:tbl");
  for (const tbl of tblElements) {
    const rows = tbl.getElementsByTagName("w:tr");
    const tableData: string[][] = [];

    for (const row of rows) {
      const cells = row.getElementsByTagName("w:tc");
      const rowData: string[] = [];

      for (const cell of cells) {
        const textElements = cell.getElementsByTagName("w:t");
        const cellText = Array.from(textElements)
          .map(t => t.textContent)
          .join("");
        rowData.push(cellText);
      }

      tableData.push(rowData);
    }

    tables.push({ rows: tableData });
  }

  return tables;
}
```

### 7.5 API Requirement Sets

| Requirement Set | Minimum Version | Features Used |
|-----------------|-----------------|---------------|
| WordApi 1.1 | Office 2016 | Basic document access, body.text |
| WordApi 1.2 | Office 2016 | Content controls, styles |
| WordApi 1.3 | Office 2019 | Search with options, range operations |
| WordApi 1.4 | Microsoft 365 | Content control events |
| WordApi 1.5 | Microsoft 365 | Annotations (preview) |

**Minimum supported version for MVP:** WordApi 1.3 (Office 2019 / Microsoft 365)

---

## 8. Authentication Architecture

### 8.1 Authentication Strategy Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     Authentication Flow                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Step 1: Check for existing session                       │  │
│  │  localStorage.getItem('nda-analyst-token')                │  │
│  └───────────────────┬───────────────────────────────────────┘  │
│                      │                                          │
│           ┌──────────┴──────────┐                               │
│           │   Token exists?     │                               │
│           └──────────┬──────────┘                               │
│                      │                                          │
│         ┌────────────┼────────────┐                             │
│         │ Yes                     │ No                          │
│         ▼                         ▼                             │
│  ┌──────────────┐       ┌──────────────────────────────────┐   │
│  │ Validate     │       │  Step 2: Try SSO                  │   │
│  │ token with   │       │  OfficeRuntime.auth.getAccessToken│   │
│  │ backend      │       └──────────────┬───────────────────┘   │
│  └──────┬───────┘                      │                        │
│         │                    ┌─────────┴─────────┐              │
│         │                    │   SSO Success?    │              │
│         │                    └─────────┬─────────┘              │
│         │                              │                        │
│         │              ┌───────────────┼───────────────┐        │
│         │              │ Yes                           │ No     │
│         │              ▼                               ▼        │
│         │    ┌──────────────────┐       ┌────────────────────┐ │
│         │    │ Exchange Office  │       │ Step 3: Dialog Auth│ │
│         │    │ token for NDA    │       │ displayDialogAsync │ │
│         │    │ Analyst token    │       │ with OAuth flow    │ │
│         │    └────────┬─────────┘       └──────────┬─────────┘ │
│         │             │                            │            │
│         │             ▼                            ▼            │
│         │    ┌──────────────────────────────────────────────┐  │
│         │    │          Store token in localStorage          │  │
│         │    │          Attach to all API requests           │  │
│         └───▶│                                               │  │
│              └──────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 8.2 SSO Implementation

```typescript
// src/helpers/auth.ts

const API_BASE = "https://nda-analyst.vercel.app";

interface AuthResult {
  token: string;
  user: {
    id: string;
    email: string;
    name: string;
    organizationId?: string;
  };
  expiresAt: number;
}

/**
 * Primary authentication method using Office SSO
 */
async function authenticateWithSSO(): Promise<AuthResult> {
  try {
    // Request an access token from Office
    const officeToken = await OfficeRuntime.auth.getAccessToken({
      allowSignInPrompt: true,
      allowConsentPrompt: true,
      forMSGraphAccess: false  // We're not calling MS Graph
    });

    // Exchange Office token for NDA Analyst token
    const response = await fetch(`${API_BASE}/api/word-addin/auth/exchange`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ officeToken })
    });

    if (!response.ok) {
      throw new Error(`Token exchange failed: ${response.status}`);
    }

    return await response.json();

  } catch (error) {
    // SSO not available or failed - will fall back to dialog
    console.log("SSO unavailable, will use dialog auth:", error);
    throw error;
  }
}
```

### 8.3 Dialog-Based Fallback

```typescript
/**
 * Fallback authentication via popup dialog
 * Used when SSO is not available (older Office, personal accounts, etc.)
 */
function authenticateWithDialog(): Promise<AuthResult> {
  return new Promise((resolve, reject) => {
    const authUrl = `${API_BASE}/word-addin/auth?` + new URLSearchParams({
      redirect: `${API_BASE}/word-addin/auth/callback`,
      source: "word-addin"
    });

    Office.context.ui.displayDialogAsync(
      authUrl,
      {
        height: 60,
        width: 30,
        promptBeforeOpen: false,
        displayInIframe: false  // Full popup for OAuth redirects
      },
      (asyncResult) => {
        if (asyncResult.status === Office.AsyncResultStatus.Failed) {
          reject(new Error(`Dialog failed: ${asyncResult.error.message}`));
          return;
        }

        const dialog = asyncResult.value;

        // Handle successful authentication
        dialog.addEventHandler(
          Office.EventType.DialogMessageReceived,
          (arg: { message: string }) => {
            try {
              const result: AuthResult = JSON.parse(arg.message);
              dialog.close();
              resolve(result);
            } catch {
              dialog.close();
              reject(new Error("Invalid auth response"));
            }
          }
        );

        // Handle dialog closed without completing
        dialog.addEventHandler(
          Office.EventType.DialogEventReceived,
          (arg: { error: number }) => {
            reject(new Error(`Dialog closed: ${arg.error}`));
          }
        );
      }
    );
  });
}
```

### 8.4 Unified Auth Flow

```typescript
/**
 * Main authentication entry point
 * Tries SSO first, falls back to dialog
 */
export async function authenticate(): Promise<AuthResult> {
  // Check for existing valid session
  const stored = getStoredAuth();
  if (stored && stored.expiresAt > Date.now()) {
    return stored;
  }

  // Try SSO first
  try {
    const result = await authenticateWithSSO();
    storeAuth(result);
    return result;
  } catch {
    // Fall back to dialog
    const result = await authenticateWithDialog();
    storeAuth(result);
    return result;
  }
}

function storeAuth(result: AuthResult): void {
  localStorage.setItem("nda-analyst-auth", JSON.stringify(result));
}

function getStoredAuth(): AuthResult | null {
  const stored = localStorage.getItem("nda-analyst-auth");
  return stored ? JSON.parse(stored) : null;
}

export function signOut(): void {
  localStorage.removeItem("nda-analyst-auth");
}
```

### 8.5 Azure AD App Registration

Required app registration configuration:

```json
{
  "displayName": "NDA Analyst for Word",
  "signInAudience": "AzureADandPersonalMicrosoftAccount",
  "api": {
    "requestedAccessTokenVersion": 2,
    "oauth2PermissionScopes": [
      {
        "id": "unique-guid-here",
        "adminConsentDescription": "Allow the application to access NDA Analyst on behalf of the signed-in user.",
        "adminConsentDisplayName": "Access NDA Analyst",
        "userConsentDescription": "Allow the application to access NDA Analyst on your behalf.",
        "userConsentDisplayName": "Access NDA Analyst",
        "isEnabled": true,
        "type": "User",
        "value": "access_as_user"
      }
    ],
    "preAuthorizedApplications": [
      {
        "appId": "ea5a67f6-b6f3-4338-b240-c655ddc3cc8e",
        "delegatedPermissionIds": ["unique-guid-here"]
      },
      {
        "appId": "57fb890c-0dab-4253-a5e0-7188c88b2bb4",
        "delegatedPermissionIds": ["unique-guid-here"]
      },
      {
        "appId": "08e18876-6177-487e-b8b5-cf950c1e598c",
        "delegatedPermissionIds": ["unique-guid-here"]
      },
      {
        "appId": "bc59ab01-8403-45c6-8796-ac3ef710b3e3",
        "delegatedPermissionIds": ["unique-guid-here"]
      },
      {
        "appId": "d3590ed6-52b3-4102-aeff-aad2292ab01c",
        "delegatedPermissionIds": ["unique-guid-here"]
      }
    ]
  },
  "web": {
    "redirectUris": [
      "https://nda-analyst.vercel.app/word-addin/auth/callback"
    ]
  }
}
```

---

## 9. Feature Specifications

### F-WA-001: Document Analysis

**Description:** Analyze the currently open Word document for NDA clauses, risks, and gaps.

**Acceptance Criteria:**

1. User clicks "Analyze" button in task pane or ribbon
2. System extracts document text via Office.js (< 2 seconds)
3. System sends text to backend API
4. Backend triggers Inngest analysis pipeline
5. Task pane shows real-time progress:
   - Stage name (Parsing, Classifying, Scoring, Gap Analysis)
   - Progress percentage
   - Elapsed time
6. On completion, task pane displays:
   - Overall risk score with gauge visualization
   - List of extracted clauses with risk badges
   - Gap analysis section
7. Document is marked with content controls for each clause

**API Endpoint:**

```typescript
// POST /api/word-addin/analyze
interface AnalyzeRequest {
  content: string;           // Full document text
  paragraphs: {              // Structured paragraph data
    text: string;
    style: string;
    isHeading: boolean;
  }[];
  metadata: {
    title: string;
    author?: string;
    source: "word-addin";
  };
}

interface AnalyzeResponse {
  analysisId: string;
  status: "queued";
  estimatedDuration: number;  // Seconds
}
```

**Progress Events (SSE):**

```typescript
// GET /api/word-addin/status/:analysisId
// Content-Type: text/event-stream

interface ProgressEvent {
  stage: "parsing" | "classifying" | "scoring" | "gap_analysis" | "complete" | "failed";
  progress: number;      // 0-100
  message: string;       // Human-readable status
  clauses?: number;      // Clauses found so far
  error?: string;        // If failed
}
```

### F-WA-002: Clause Visualization

**Description:** Mark identified clauses in the document with color-coded content controls.

**Acceptance Criteria:**

1. Each extracted clause is wrapped in a content control
2. Content control color indicates risk level:
   - Red (#ef4444): Aggressive
   - Amber (#f59e0b): Cautious
   - Green (#22c55e): Standard
   - Gray (#6b7280): Unknown
3. Content control title shows clause category
4. Content control tag contains clause ID for lookup
5. Clicking a clause in task pane scrolls document to that clause
6. User can clear all NDA Analyst markers with one action
7. Markers persist when document is saved and reopened

**Technical Constraints:**

- Content controls may overlap (one text span could be multiple clause types)
- Resolution: Use the primary category only, store secondary categories in metadata
- Large documents (>100 clauses) may have performance impact
- Resolution: Batch content control insertion, use requestAnimationFrame

### F-WA-003: Risk Assessment Display

**Description:** Show detailed risk assessment for each clause with evidence.

**Acceptance Criteria:**

1. Each clause in task pane shows:
   - Category name (e.g., "Non-Compete")
   - Risk level badge
   - Confidence percentage
   - One-line risk summary
2. Expanding a clause reveals:
   - Full risk explanation (2-3 sentences)
   - Cited evidence from reference corpus
   - Statistical context (e.g., "Duration exceeds 87% of NDAs in dataset")
   - Matched reference clause (if applicable)
3. Evidence includes links to source (CUAD contract ID)

**Data Model:**

```typescript
interface ClauseResult {
  id: string;
  category: string;
  secondaryCategories?: string[];
  text: string;
  textPreview: string;  // First 100 chars for display
  startPosition: number;
  endPosition: number;
  confidence: number;
  riskLevel: "standard" | "cautious" | "aggressive" | "unknown";
  riskExplanation: string;
  evidence: {
    source: "cuad" | "contract_nli" | "template";
    referenceId: string;
    referenceText: string;
    similarity: number;
  }[];
  statistics?: {
    metric: string;       // "duration"
    value: string;        // "36 months"
    percentile: number;   // 92
    comparison: string;   // "exceeds 92% of NDAs"
  };
}
```

### F-WA-004: Gap Analysis

**Description:** Identify standard NDA clauses that are missing from the document.

**Acceptance Criteria:**

1. Gap analysis section shows CUAD categories with no matching clause
2. Each missing category displays:
   - Category name
   - Importance level (Critical / Important / Optional)
   - Brief explanation of what protection is missing
   - Recommended standard language (from templates)
3. User can filter gaps by importance level
4. Clicking a gap shows detailed explanation and example language

### F-WA-005: Authentication Flow

**Description:** Authenticate users via SSO or dialog-based OAuth.

**Acceptance Criteria:**

1. On first load, check for stored valid token
2. If no token, attempt SSO silently
3. If SSO fails, show "Sign In" button
4. Clicking "Sign In" opens OAuth dialog
5. User can sign in with Google or GitHub (same as web app)
6. On success, store token and display user info
7. User can sign out via settings menu
8. Token automatically refreshes before expiration

### F-WA-006: Ribbon Commands

**Description:** Add NDA Analyst commands to the Word ribbon.

**Acceptance Criteria:**

1. New "NDA Analyst" tab in ribbon (or group in existing tab)
2. Commands:
   - **Analyze NDA:** Start analysis of current document
   - **Show Panel:** Toggle task pane visibility
   - **Clear Markers:** Remove all NDA Analyst content controls
   - **Settings:** Open settings dialog
3. Icons are clear and professional
4. Keyboard shortcuts:
   - Ctrl+Shift+A: Analyze
   - Ctrl+Shift+N: Toggle panel

---

## 10. API Integration Design

### 10.1 New Backend Endpoints

```typescript
// app/api/word-addin/analyze/route.ts
export async function POST(request: Request) {
  const session = await verifyWordAddinAuth(request);
  const body = await request.json();

  // Validate input
  const parsed = wordAddinAnalyzeSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(ValidationError.fromZodError(parsed.error));
  }

  // Create document record
  const document = await createDocument({
    tenantId: session.organizationId,
    uploadedBy: session.userId,
    title: parsed.data.metadata.title,
    fileType: "docx",  // Word add-in always sends from Word
    rawText: parsed.data.content,
    source: "word-addin",
    metadata: parsed.data.metadata
  });

  // Trigger analysis
  await inngest.send({
    name: "nda/analyze.requested",
    data: { documentId: document.id }
  });

  return successResponse({
    analysisId: document.id,
    status: "queued"
  });
}
```

```typescript
// app/api/word-addin/status/[id]/route.ts
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await verifyWordAddinAuth(request);

  // Set up SSE stream
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      // Subscribe to Inngest progress events
      const unsubscribe = await subscribeToAnalysisProgress(
        params.id,
        session.organizationId,
        (event) => {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
          );

          if (event.stage === "complete" || event.stage === "failed") {
            controller.close();
          }
        }
      );

      // Clean up on disconnect
      request.signal.addEventListener("abort", () => {
        unsubscribe();
        controller.close();
      });
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive"
    }
  });
}
```

```typescript
// app/api/word-addin/results/[id]/route.ts
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await verifyWordAddinAuth(request);

  const analysis = await getAnalysisWithClauses(
    params.id,
    session.organizationId
  );

  if (!analysis) {
    return errorResponse(new NotFoundError("Analysis not found"));
  }

  return successResponse({
    analysisId: analysis.id,
    status: analysis.status,
    overallRiskScore: analysis.overallRiskScore,
    overallRiskLevel: analysis.overallRiskLevel,
    summary: analysis.summary,
    clauses: analysis.clauses.map(formatClauseForWordAddin),
    gapAnalysis: analysis.gapAnalysis,
    tokenUsage: analysis.tokenUsage,
    processingTimeMs: analysis.processingTimeMs
  });
}
```

```typescript
// app/api/word-addin/auth/exchange/route.ts
export async function POST(request: Request) {
  const { officeToken } = await request.json();

  // Validate Office token with Azure AD
  const officeUser = await validateOfficeToken(officeToken);

  // Find or create user
  let user = await findUserByEmail(officeUser.email);
  if (!user) {
    // Auto-provision user and organization
    user = await createUserFromOffice(officeUser);
  }

  // Generate NDA Analyst session token
  const token = await createSessionToken(user);

  return successResponse({
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      organizationId: user.organizationId
    },
    expiresAt: Date.now() + 24 * 60 * 60 * 1000  // 24 hours
  });
}
```

### 10.2 Schema Updates

```typescript
// src/db/schema/documents.ts
export const documents = pgTable("documents", {
  // ... existing columns ...

  // Add source tracking
  source: text("source").default("web"),  // "web" | "word-addin" | "api"

  // Add Word-specific metadata
  wordDocumentUrl: text("word_document_url"),  // Optional: Office doc URL if available
});
```

### 10.3 Client API Module

```typescript
// packages/word-addin/src/api/client.ts
import { authenticate } from "../helpers/auth";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "https://nda-analyst.vercel.app";

class NDAAnalystClient {
  private token: string | null = null;

  async ensureAuthenticated(): Promise<void> {
    if (!this.token) {
      const auth = await authenticate();
      this.token = auth.token;
    }
  }

  private async fetch<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    await this.ensureAuthenticated();

    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.token}`,
        ...options.headers
      }
    });

    if (!response.ok) {
      const error = await response.json();
      throw new APIError(error.error.code, error.error.message);
    }

    const data = await response.json();
    return data.data;
  }

  async analyzeDocument(content: DocumentContent): Promise<AnalyzeResponse> {
    return this.fetch("/api/word-addin/analyze", {
      method: "POST",
      body: JSON.stringify(content)
    });
  }

  subscribeToProgress(
    analysisId: string,
    onProgress: (event: ProgressEvent) => void,
    onError: (error: Error) => void
  ): () => void {
    const eventSource = new EventSource(
      `${API_BASE}/api/word-addin/status/${analysisId}`,
      {
        headers: { "Authorization": `Bearer ${this.token}` }
      }
    );

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      onProgress(data);
    };

    eventSource.onerror = (event) => {
      onError(new Error("Connection lost"));
    };

    return () => eventSource.close();
  }

  async getResults(analysisId: string): Promise<AnalysisResults> {
    return this.fetch(`/api/word-addin/results/${analysisId}`);
  }
}

export const apiClient = new NDAAnalystClient();
```

---

## 11. UI/UX Requirements

### 11.1 Task Pane Design

```
┌─────────────────────────────────────────┐
│  NDA Analyst                    [≡] [×] │
├─────────────────────────────────────────┤
│                                         │
│  ┌─────────────────────────────────────┐│
│  │  📄 Analyze Current Document        ││
│  │     Click to start NDA analysis     ││
│  └─────────────────────────────────────┘│
│                                         │
│  ─────────────────────────────────────  │
│                                         │
│  [Signed in as: sarah@acme.com    ▼]    │
│                                         │
└─────────────────────────────────────────┘

        ↓ After clicking Analyze ↓

┌─────────────────────────────────────────┐
│  NDA Analyst                    [≡] [×] │
├─────────────────────────────────────────┤
│                                         │
│  Analyzing Document...                  │
│  ┌─────────────────────────────────────┐│
│  │ ████████████░░░░░░░░░░░░░ 45%      ││
│  └─────────────────────────────────────┘│
│  Stage: Scoring clauses (8 of 15)       │
│  Elapsed: 23s                           │
│                                         │
│  ┌─────────────────────────────────────┐│
│  │ ✓ Parsing document                  ││
│  │ ✓ Extracting clauses (15 found)     ││
│  │ ● Scoring risks...                  ││
│  │ ○ Gap analysis                      ││
│  └─────────────────────────────────────┘│
│                                         │
│  [Cancel]                               │
│                                         │
└─────────────────────────────────────────┘

        ↓ After completion ↓

┌─────────────────────────────────────────┐
│  NDA Analyst                    [≡] [×] │
├─────────────────────────────────────────┤
│                                         │
│  📊 OVERALL RISK                        │
│  ┌─────────────────────────────────────┐│
│  │           ┌──────┐                  ││
│  │     ┌─────┤ 68 % ├─────┐            ││
│  │   Low     └──────┘    High          ││
│  │         CAUTIOUS                    ││
│  └─────────────────────────────────────┘│
│  Some clauses may benefit from          │
│  negotiation. See details below.        │
│                                         │
│  ─────────────────────────────────────  │
│                                         │
│  📋 CLAUSES (15)         [Filter ▼]     │
│                                         │
│  ┌─────────────────────────────────────┐│
│  │ 🔴 Non-Compete                  [→] ││
│  │    36 months · 92nd percentile      ││
│  ├─────────────────────────────────────┤│
│  │ 🟡 Confidentiality Period       [→] ││
│  │    Perpetual · No time limit        ││
│  ├─────────────────────────────────────┤│
│  │ 🟢 Governing Law                [→] ││
│  │    Delaware · Standard              ││
│  ├─────────────────────────────────────┤│
│  │ 🟢 Parties                      [→] ││
│  │    Clearly identified               ││
│  └─────────────────────────────────────┘│
│  [Show all 15 clauses...]               │
│                                         │
│  ─────────────────────────────────────  │
│                                         │
│  ⚠️ MISSING CLAUSES (2)                 │
│  ┌─────────────────────────────────────┐│
│  │ ⚪ Audit Rights              Critical││
│  │    No audit provisions found        ││
│  ├─────────────────────────────────────┤│
│  │ ⚪ Insurance Requirements    Optional││
│  │    No insurance clause              ││
│  └─────────────────────────────────────┘│
│                                         │
│  ─────────────────────────────────────  │
│                                         │
│  [Clear Markers]  [Export Report]       │
│                                         │
└─────────────────────────────────────────┘
```

### 11.2 Expanded Clause View

```
┌─────────────────────────────────────────┐
│  ← Back to Clauses                      │
├─────────────────────────────────────────┤
│                                         │
│  🔴 Non-Compete                         │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━    │
│                                         │
│  Risk Level: AGGRESSIVE                 │
│  Confidence: 94%                        │
│                                         │
│  📝 CLAUSE TEXT                         │
│  ┌─────────────────────────────────────┐│
│  │ "The Receiving Party agrees not to  ││
│  │ engage in any business competitive  ││
│  │ with the Disclosing Party for a     ││
│  │ period of thirty-six (36) months    ││
│  │ following termination..."           ││
│  └─────────────────────────────────────┘│
│  [Go to clause in document]             │
│                                         │
│  ⚠️ RISK ASSESSMENT                     │
│  ─────────────────────────────────────  │
│  This non-compete clause extends 36     │
│  months, which exceeds 92% of NDAs in   │
│  our reference dataset. Industry        │
│  standard is 12-24 months.              │
│                                         │
│  Additionally, the geographic scope     │
│  ("worldwide") is unusually broad.      │
│  Consider negotiating a more limited    │
│  geographic restriction.                │
│                                         │
│  📊 STATISTICAL CONTEXT                 │
│  ┌─────────────────────────────────────┐│
│  │ Duration Distribution               ││
│  │ Your NDA: 36 months                 ││
│  │ ┌────────────────────────────────┐  ││
│  │ │▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░│  ││
│  │ └────────────────────────────────┘  ││
│  │ 0     12    24    36    48 months   ││
│  │          ↑ 92nd percentile          ││
│  └─────────────────────────────────────┘│
│                                         │
│  📖 REFERENCE EVIDENCE                  │
│  ─────────────────────────────────────  │
│  Similar clause from CUAD dataset:      │
│  "Vendor agrees not to compete for      │
│  18 months following termination,       │
│  limited to the State of California."   │
│  — Contract: MasterServices_2019_042    │
│                                         │
│  ContractNLI Hypothesis:                │
│  "No non-competition obligation"        │
│  Status: ❌ CONTRADICTED                │
│                                         │
└─────────────────────────────────────────┘
```

### 11.3 Design Specifications

| Property | Value |
|----------|-------|
| Task pane width | 350px (default), resizable |
| Font family | Segoe UI (Windows), San Francisco (Mac) |
| Font size | 13px body, 11px secondary |
| Risk colors | #ef4444 (aggressive), #f59e0b (cautious), #22c55e (standard), #6b7280 (unknown) |
| Spacing | 8px base unit |
| Border radius | 4px |
| Animation | 150ms ease-out |

### 11.4 Responsive Behavior

- Task pane adjusts to width changes
- Long clause text truncates with "..." and expand on click
- Risk gauge scales proportionally
- Scrollable clause list with sticky header

---

## 12. Manifest Configuration

### 12.1 Unified Manifest (JSON)

```json
{
  "$schema": "https://raw.githubusercontent.com/OfficeDev/office-js-docs-pr/main/docs/resources/unified-manifest-schema.json",
  "id": "00000000-0000-0000-0000-000000000000",
  "version": "1.0.0",
  "manifestVersion": "1.1",
  "name": {
    "short": "NDA Analyst",
    "full": "NDA Analyst for Microsoft Word"
  },
  "description": {
    "short": "Analyze NDAs for risks and missing clauses",
    "full": "NDA Analyst brings AI-powered contract analysis directly into Microsoft Word. Identify risky clauses, missing protections, and get evidence-based recommendations without leaving your document."
  },
  "developer": {
    "name": "NDA Analyst",
    "websiteUrl": "https://nda-analyst.vercel.app",
    "privacyUrl": "https://nda-analyst.vercel.app/privacy",
    "termsOfUseUrl": "https://nda-analyst.vercel.app/terms"
  },
  "localizationInfo": {
    "defaultLanguageTag": "en-US",
    "additionalLanguages": []
  },
  "icons": {
    "outline": "assets/icon-outline.png",
    "color": "assets/icon-color.png"
  },
  "accentColor": "#22c55e",
  "authorization": {
    "permissions": {
      "resourceSpecific": [
        {
          "name": "Document.ReadWrite.User",
          "type": "Delegated"
        }
      ]
    }
  },
  "validDomains": [
    "nda-analyst.vercel.app",
    "*.nda-analyst.vercel.app"
  ],
  "webApplicationInfo": {
    "id": "azure-app-id-here",
    "resource": "api://nda-analyst.vercel.app/azure-app-id-here"
  },
  "extensions": [
    {
      "requirements": {
        "scopes": ["document"],
        "capabilities": [
          {
            "name": "Mailbox",
            "minVersion": "1.1"
          }
        ],
        "formFactors": ["desktop", "web"]
      },
      "runtimes": [
        {
          "id": "TaskPaneRuntime",
          "type": "general",
          "code": {
            "page": "https://nda-analyst.vercel.app/word-addin/taskpane.html"
          },
          "lifetime": "short"
        },
        {
          "id": "CommandsRuntime",
          "type": "general",
          "code": {
            "script": "https://nda-analyst.vercel.app/word-addin/commands.js"
          }
        }
      ],
      "ribbons": [
        {
          "contexts": ["default"],
          "tabs": [
            {
              "builtInTabId": "TabHome",
              "groups": [
                {
                  "id": "NDAAnalystGroup",
                  "label": "NDA Analyst",
                  "icons": [
                    {
                      "size": 16,
                      "url": "https://nda-analyst.vercel.app/word-addin/assets/icon-16.png"
                    },
                    {
                      "size": 32,
                      "url": "https://nda-analyst.vercel.app/word-addin/assets/icon-32.png"
                    }
                  ],
                  "controls": [
                    {
                      "id": "AnalyzeButton",
                      "type": "button",
                      "label": "Analyze NDA",
                      "icons": [
                        {
                          "size": 16,
                          "url": "https://nda-analyst.vercel.app/word-addin/assets/analyze-16.png"
                        },
                        {
                          "size": 32,
                          "url": "https://nda-analyst.vercel.app/word-addin/assets/analyze-32.png"
                        }
                      ],
                      "supertip": {
                        "title": "Analyze NDA",
                        "description": "Extract clauses, assess risks, and identify missing protections in the current document."
                      },
                      "actionId": "analyzeDocument"
                    },
                    {
                      "id": "ShowPanelButton",
                      "type": "button",
                      "label": "Show Panel",
                      "icons": [
                        {
                          "size": 16,
                          "url": "https://nda-analyst.vercel.app/word-addin/assets/panel-16.png"
                        },
                        {
                          "size": 32,
                          "url": "https://nda-analyst.vercel.app/word-addin/assets/panel-32.png"
                        }
                      ],
                      "supertip": {
                        "title": "Show Analysis Panel",
                        "description": "Open the NDA Analyst task pane to view analysis results."
                      },
                      "actionId": "showTaskPane"
                    }
                  ]
                }
              ]
            }
          ]
        }
      ],
      "autoRunEvents": [],
      "alternates": []
    }
  ]
}
```

### 12.2 Fallback XML Manifest

For environments that don't support the unified manifest:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<OfficeApp xmlns="http://schemas.microsoft.com/office/appforoffice/1.1"
           xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
           xmlns:bt="http://schemas.microsoft.com/office/officeappbasictypes/1.0"
           xmlns:ov="http://schemas.microsoft.com/office/taskpaneappversionoverrides"
           xsi:type="TaskPaneApp">

  <Id>00000000-0000-0000-0000-000000000000</Id>
  <Version>1.0.0.0</Version>
  <ProviderName>NDA Analyst</ProviderName>
  <DefaultLocale>en-US</DefaultLocale>
  <DisplayName DefaultValue="NDA Analyst"/>
  <Description DefaultValue="Analyze NDAs for risks and missing clauses"/>

  <IconUrl DefaultValue="https://nda-analyst.vercel.app/word-addin/assets/icon-32.png"/>
  <HighResolutionIconUrl DefaultValue="https://nda-analyst.vercel.app/word-addin/assets/icon-80.png"/>
  <SupportUrl DefaultValue="https://nda-analyst.vercel.app/support"/>

  <AppDomains>
    <AppDomain>https://nda-analyst.vercel.app</AppDomain>
  </AppDomains>

  <Hosts>
    <Host Name="Document"/>
  </Hosts>

  <Requirements>
    <Sets>
      <Set Name="WordApi" MinVersion="1.3"/>
    </Sets>
  </Requirements>

  <DefaultSettings>
    <SourceLocation DefaultValue="https://nda-analyst.vercel.app/word-addin/taskpane.html"/>
  </DefaultSettings>

  <Permissions>ReadWriteDocument</Permissions>

  <VersionOverrides xmlns="http://schemas.microsoft.com/office/taskpaneappversionoverrides" xsi:type="VersionOverridesV1_0">
    <Hosts>
      <Host xsi:type="Document">
        <DesktopFormFactor>
          <GetStarted>
            <Title resid="GetStarted.Title"/>
            <Description resid="GetStarted.Description"/>
            <LearnMoreUrl resid="GetStarted.LearnMoreUrl"/>
          </GetStarted>
          <FunctionFile resid="Commands.Url"/>
          <ExtensionPoint xsi:type="PrimaryCommandSurface">
            <OfficeTab id="TabHome">
              <Group id="NDAAnalystGroup">
                <Label resid="Group.Label"/>
                <Icon>
                  <bt:Image size="16" resid="Icon.16x16"/>
                  <bt:Image size="32" resid="Icon.32x32"/>
                  <bt:Image size="80" resid="Icon.80x80"/>
                </Icon>
                <Control xsi:type="Button" id="AnalyzeButton">
                  <Label resid="Analyze.Label"/>
                  <Supertip>
                    <Title resid="Analyze.Title"/>
                    <Description resid="Analyze.Description"/>
                  </Supertip>
                  <Icon>
                    <bt:Image size="16" resid="Analyze.16x16"/>
                    <bt:Image size="32" resid="Analyze.32x32"/>
                    <bt:Image size="80" resid="Analyze.80x80"/>
                  </Icon>
                  <Action xsi:type="ExecuteFunction">
                    <FunctionName>analyzeDocument</FunctionName>
                  </Action>
                </Control>
                <Control xsi:type="Button" id="ShowPanelButton">
                  <Label resid="ShowPanel.Label"/>
                  <Supertip>
                    <Title resid="ShowPanel.Title"/>
                    <Description resid="ShowPanel.Description"/>
                  </Supertip>
                  <Icon>
                    <bt:Image size="16" resid="Panel.16x16"/>
                    <bt:Image size="32" resid="Panel.32x32"/>
                    <bt:Image size="80" resid="Panel.80x80"/>
                  </Icon>
                  <Action xsi:type="ShowTaskpane">
                    <TaskpaneId>TaskPane</TaskpaneId>
                    <SourceLocation resid="TaskPane.Url"/>
                  </Action>
                </Control>
              </Group>
            </OfficeTab>
          </ExtensionPoint>
        </DesktopFormFactor>
      </Host>
    </Hosts>

    <Resources>
      <bt:Images>
        <bt:Image id="Icon.16x16" DefaultValue="https://nda-analyst.vercel.app/word-addin/assets/icon-16.png"/>
        <bt:Image id="Icon.32x32" DefaultValue="https://nda-analyst.vercel.app/word-addin/assets/icon-32.png"/>
        <bt:Image id="Icon.80x80" DefaultValue="https://nda-analyst.vercel.app/word-addin/assets/icon-80.png"/>
        <bt:Image id="Analyze.16x16" DefaultValue="https://nda-analyst.vercel.app/word-addin/assets/analyze-16.png"/>
        <bt:Image id="Analyze.32x32" DefaultValue="https://nda-analyst.vercel.app/word-addin/assets/analyze-32.png"/>
        <bt:Image id="Analyze.80x80" DefaultValue="https://nda-analyst.vercel.app/word-addin/assets/analyze-80.png"/>
        <bt:Image id="Panel.16x16" DefaultValue="https://nda-analyst.vercel.app/word-addin/assets/panel-16.png"/>
        <bt:Image id="Panel.32x32" DefaultValue="https://nda-analyst.vercel.app/word-addin/assets/panel-32.png"/>
        <bt:Image id="Panel.80x80" DefaultValue="https://nda-analyst.vercel.app/word-addin/assets/panel-80.png"/>
      </bt:Images>
      <bt:Urls>
        <bt:Url id="TaskPane.Url" DefaultValue="https://nda-analyst.vercel.app/word-addin/taskpane.html"/>
        <bt:Url id="Commands.Url" DefaultValue="https://nda-analyst.vercel.app/word-addin/commands.html"/>
        <bt:Url id="GetStarted.LearnMoreUrl" DefaultValue="https://nda-analyst.vercel.app/docs/word-addin"/>
      </bt:Urls>
      <bt:ShortStrings>
        <bt:String id="Group.Label" DefaultValue="NDA Analyst"/>
        <bt:String id="Analyze.Label" DefaultValue="Analyze NDA"/>
        <bt:String id="Analyze.Title" DefaultValue="Analyze NDA"/>
        <bt:String id="ShowPanel.Label" DefaultValue="Show Panel"/>
        <bt:String id="ShowPanel.Title" DefaultValue="Show Analysis Panel"/>
        <bt:String id="GetStarted.Title" DefaultValue="Get Started"/>
      </bt:ShortStrings>
      <bt:LongStrings>
        <bt:String id="Analyze.Description" DefaultValue="Extract clauses, assess risks, and identify missing protections."/>
        <bt:String id="ShowPanel.Description" DefaultValue="Open the NDA Analyst task pane to view analysis results."/>
        <bt:String id="GetStarted.Description" DefaultValue="Click Analyze NDA to start analyzing the current document."/>
      </bt:LongStrings>
    </Resources>
  </VersionOverrides>
</OfficeApp>
```

---

## 13. Development Environment

### 13.1 Project Structure

```
packages/word-addin/
├── src/
│   ├── taskpane/
│   │   ├── index.html              # Task pane HTML shell
│   │   ├── index.tsx               # React entry point
│   │   ├── App.tsx                 # Main application component
│   │   └── components/
│   │       ├── AnalysisView.tsx    # Results display
│   │       ├── ClauseCard.tsx      # Individual clause card
│   │       ├── ClauseDetail.tsx    # Expanded clause view
│   │       ├── GapAnalysis.tsx     # Missing clauses section
│   │       ├── ProgressView.tsx    # Analysis in progress
│   │       ├── RiskGauge.tsx       # Overall risk meter
│   │       ├── SignIn.tsx          # Authentication UI
│   │       └── Settings.tsx        # Settings panel
│   ├── commands/
│   │   ├── commands.html           # Commands HTML shell
│   │   └── commands.ts             # Ribbon button handlers
│   ├── helpers/
│   │   ├── auth.ts                 # Authentication logic
│   │   ├── document.ts             # Office.js document helpers
│   │   └── contentControls.ts      # Content control management
│   ├── api/
│   │   └── client.ts               # Backend API client
│   ├── store/
│   │   └── analysis.ts             # Zustand state management
│   └── types/
│       ├── analysis.ts             # Analysis result types
│       └── office.ts               # Office.js type extensions
├── assets/
│   ├── icon-16.png
│   ├── icon-32.png
│   ├── icon-80.png
│   ├── analyze-16.png
│   ├── analyze-32.png
│   └── analyze-80.png
├── manifest.json                   # Unified manifest
├── manifest.xml                    # Fallback XML manifest
├── webpack.config.js
├── tsconfig.json
├── package.json
└── README.md
```

### 13.2 Development Setup

```bash
# From repository root
cd packages/word-addin

# Install dependencies
pnpm install

# Generate development certificates
pnpm run dev-certs

# Start development server
pnpm run dev
# Starts webpack-dev-server on https://localhost:3001
# Automatically sideloads add-in into Word

# Start for Word Online (browser debugging)
pnpm run dev:web
```

### 13.3 Package.json

```json
{
  "name": "@nda-analyst/word-addin",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "office-addin-debugging start manifest.json",
    "dev:web": "webpack serve --mode development",
    "build": "webpack --mode production",
    "lint": "eslint src --ext .ts,.tsx",
    "test": "vitest",
    "dev-certs": "office-addin-dev-certs install",
    "validate": "office-addin-manifest validate manifest.json",
    "sideload": "office-addin-dev-settings sideload manifest.json"
  },
  "dependencies": {
    "@types/office-js": "^1.0.377",
    "office-addin-react": "^1.0.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "zustand": "^4.5.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "office-addin-dev-certs": "^1.13.0",
    "office-addin-debugging": "^5.1.0",
    "office-addin-dev-settings": "^2.0.0",
    "office-addin-manifest": "^1.13.0",
    "typescript": "^5.3.0",
    "webpack": "^5.90.0",
    "webpack-cli": "^5.1.0",
    "webpack-dev-server": "^4.15.0",
    "vitest": "^1.2.0"
  }
}
```

### 13.4 Webpack Configuration

```javascript
// webpack.config.js
const HtmlWebpackPlugin = require("html-webpack-plugin");
const path = require("path");

module.exports = (env, argv) => {
  const isDev = argv.mode === "development";

  return {
    entry: {
      taskpane: "./src/taskpane/index.tsx",
      commands: "./src/commands/commands.ts"
    },
    output: {
      path: path.resolve(__dirname, "dist"),
      filename: "[name].js",
      clean: true
    },
    resolve: {
      extensions: [".ts", ".tsx", ".js"]
    },
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          use: "ts-loader",
          exclude: /node_modules/
        },
        {
          test: /\.css$/,
          use: ["style-loader", "css-loader"]
        }
      ]
    },
    plugins: [
      new HtmlWebpackPlugin({
        template: "./src/taskpane/index.html",
        filename: "taskpane.html",
        chunks: ["taskpane"]
      }),
      new HtmlWebpackPlugin({
        template: "./src/commands/commands.html",
        filename: "commands.html",
        chunks: ["commands"]
      })
    ],
    devServer: {
      port: 3001,
      https: {
        key: process.env.OFFICE_ADDIN_DEV_CERTS_KEY,
        cert: process.env.OFFICE_ADDIN_DEV_CERTS_CERT,
        ca: process.env.OFFICE_ADDIN_DEV_CERTS_CA
      },
      headers: {
        "Access-Control-Allow-Origin": "*"
      }
    },
    devtool: isDev ? "source-map" : false
  };
};
```

---

## 14. Deployment and Distribution

### 14.1 Deployment Options

| Method | Audience | Requirements | Best For |
|--------|----------|--------------|----------|
| **Sideloading** | Individual developer | None | Development, testing |
| **Network Share** | Small team | Windows network share | Internal teams |
| **SharePoint Catalog** | Organization | SharePoint admin | Medium enterprises |
| **Centralized Deployment** | Organization | Microsoft 365 admin | Large enterprises |
| **AppSource** | Public | Microsoft Partner Center | Commercial distribution |

### 14.2 Centralized Deployment (Primary Enterprise Path)

```
Microsoft 365 Admin Center
└── Settings
    └── Integrated Apps
        └── Upload Custom App
            ├── Upload manifest.json
            ├── Configure user assignment
            │   ├── Specific users/groups
            │   └── Entire organization
            └── Deploy
```

**Admin Configuration:**

1. Navigate to https://admin.microsoft.com
2. Settings → Integrated Apps → Upload Custom App
3. Upload `manifest.json`
4. Assign to users:
   - Option A: Entire organization
   - Option B: Specific groups (e.g., "Legal Department")
5. Deploy

**User Experience:**

- Add-in appears automatically in Word ribbon
- No installation required by end users
- Updates deployed centrally

### 14.3 AppSource Submission

For public distribution:

**Submission Checklist:**

- [ ] Microsoft Partner Center account
- [ ] Manifest validation passes (`pnpm validate`)
- [ ] Privacy policy URL
- [ ] Terms of use URL
- [ ] Support URL
- [ ] Test accounts for review
- [ ] Screenshots (5+ required)
- [ ] Long description (100+ words)
- [ ] Category selection (Productivity)
- [ ] Accessibility compliance
- [ ] Security review questionnaire

**Timeline:** 2-4 weeks for initial review

### 14.4 Hosting Configuration

The add-in's web assets are hosted as part of the main NDA Analyst Next.js application:

```
app/
├── word-addin/
│   ├── taskpane/
│   │   └── page.tsx        # Serves taskpane.html
│   ├── commands/
│   │   └── route.ts        # Serves commands.js
│   ├── auth/
│   │   ├── page.tsx        # OAuth dialog
│   │   └── callback/
│   │       └── route.ts    # OAuth callback
│   └── assets/
│       └── [...slug]/
│           └── route.ts    # Static assets (icons)
```

**Vercel Configuration:**

```json
// vercel.json
{
  "headers": [
    {
      "source": "/word-addin/(.*)",
      "headers": [
        {
          "key": "Access-Control-Allow-Origin",
          "value": "*"
        }
      ]
    }
  ]
}
```

---

## 15. Security and Compliance

### 15.1 Data Flow Security

```
┌─────────────────────────────────────────────────────────────────┐
│                     Security Boundaries                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  User's Word Document (Local/SharePoint/OneDrive)        │   │
│  │  ─────────────────────────────────────────────────────   │   │
│  │  • Document stays in user's environment                  │   │
│  │  • Only text content extracted (not file itself)         │   │
│  │  • No raw file upload to NDA Analyst servers             │   │
│  └───────────────────────────┬─────────────────────────────┘   │
│                              │                                  │
│                              │ Extracted text only              │
│                              │ (HTTPS/TLS 1.3)                  │
│                              ▼                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  NDA Analyst API (Vercel)                               │   │
│  │  ─────────────────────────────────────────────────────   │   │
│  │  • Text stored in tenant-isolated database              │   │
│  │  • Row-Level Security enforced                          │   │
│  │  • Encrypted at rest (AES-256)                          │   │
│  │  • Audit logging enabled                                │   │
│  │  • Soft delete with 30-day retention                    │   │
│  └───────────────────────────┬─────────────────────────────┘   │
│                              │                                  │
│                              │ Analysis context                 │
│                              │ (no PII transmitted)             │
│                              ▼                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Claude API (Anthropic)                                  │   │
│  │  ─────────────────────────────────────────────────────   │   │
│  │  • Zero data retention policy                           │   │
│  │  • Not used for model training                          │   │
│  │  • SOC 2 Type II certified                              │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 15.2 Authentication Security

| Aspect | Implementation |
|--------|----------------|
| Token storage | localStorage (encrypted in modern browsers) |
| Token lifetime | 24 hours with silent refresh |
| SSO validation | Azure AD token verification |
| OAuth flow | Authorization code with PKCE |
| Session binding | Token tied to device fingerprint |

### 15.3 Enterprise Compliance

**SOC 2 Considerations:**

- All data encrypted in transit (TLS 1.3) and at rest (AES-256)
- Audit logging of all document access and analysis requests
- Multi-tenant isolation via RLS
- No data shared between organizations

**GDPR Compliance:**

- Data minimization: only necessary text extracted
- Right to deletion: soft delete with hard purge after 30 days
- Data portability: export analysis as JSON
- Processing records maintained in audit log

**Law Firm Requirements:**

- Client matter separation via tenant isolation
- Ethical wall support via organization boundaries
- Privilege preservation: analysis metadata not shared externally

### 15.4 Legal Disclaimers

All analysis output includes:

```
This analysis is generated by AI and does not constitute legal advice.
The information provided is for general informational purposes only.
Consult a qualified attorney for legal guidance specific to your situation.

NDA Analyst uses AI models that may make errors. Always verify important
findings by reviewing the original document text.
```

---

## 16. Testing Strategy

### 16.1 Unit Tests

```typescript
// src/helpers/__tests__/document.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { extractDocumentContent } from "../document";

describe("extractDocumentContent", () => {
  beforeEach(() => {
    // Mock Office.js Word.run
    vi.mock("office-js", () => ({
      Word: {
        run: vi.fn(async (callback) => {
          const mockContext = createMockContext();
          return callback(mockContext);
        })
      }
    }));
  });

  it("extracts full document text", async () => {
    const content = await extractDocumentContent();
    expect(content.fullText).toBeDefined();
    expect(content.paragraphs).toBeInstanceOf(Array);
  });

  it("identifies headings by style", async () => {
    const content = await extractDocumentContent();
    const headings = content.paragraphs.filter(p => p.isHeading);
    expect(headings.length).toBeGreaterThan(0);
  });
});
```

### 16.2 Integration Tests

```typescript
// src/api/__tests__/client.integration.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { apiClient } from "../client";

describe("API Client Integration", () => {
  beforeAll(async () => {
    // Use test credentials
    await apiClient.authenticate({ testMode: true });
  });

  it("submits document for analysis", async () => {
    const response = await apiClient.analyzeDocument({
      fullText: "This Non-Disclosure Agreement...",
      paragraphs: [],
      metadata: { title: "Test NDA", source: "word-addin" }
    });

    expect(response.analysisId).toBeDefined();
    expect(response.status).toBe("queued");
  });

  it("receives progress updates via SSE", async () => {
    const { analysisId } = await apiClient.analyzeDocument({
      fullText: "Short NDA for testing...",
      paragraphs: [],
      metadata: { title: "Test", source: "word-addin" }
    });

    const events: ProgressEvent[] = [];

    await new Promise<void>((resolve) => {
      apiClient.subscribeToProgress(
        analysisId,
        (event) => {
          events.push(event);
          if (event.stage === "complete") resolve();
        },
        () => {}
      );
    });

    expect(events.some(e => e.stage === "parsing")).toBe(true);
    expect(events.some(e => e.stage === "complete")).toBe(true);
  });
});
```

### 16.3 End-to-End Tests

```typescript
// e2e/word-addin.spec.ts
import { test, expect } from "@playwright/test";

test.describe("Word Add-in E2E", () => {
  test("completes full analysis flow", async ({ page }) => {
    // Note: E2E testing requires Word Online or desktop automation
    // This example uses Word Online via Playwright

    await page.goto("https://www.office.com/launch/word");
    await page.waitForSelector("[data-testid='new-document']");

    // Create document with NDA content
    await page.click("[data-testid='new-document']");
    await page.keyboard.type("Non-Disclosure Agreement\n\n");
    await page.keyboard.type("This agreement is entered into...");

    // Open add-in (sideloaded for testing)
    await page.click("[data-testid='insert-tab']");
    await page.click("[data-testid='my-add-ins']");
    await page.click("text=NDA Analyst");

    // Wait for task pane
    await page.waitForSelector("[data-testid='taskpane']");

    // Start analysis
    await page.click("[data-testid='analyze-button']");

    // Wait for completion
    await page.waitForSelector("[data-testid='analysis-complete']", {
      timeout: 120000
    });

    // Verify results
    expect(await page.isVisible("[data-testid='risk-gauge']")).toBe(true);
    expect(await page.isVisible("[data-testid='clause-list']")).toBe(true);
  });
});
```

### 16.4 Manual Testing Matrix

| Scenario | Windows | Mac | Word Online |
|----------|---------|-----|-------------|
| Install via sideload | ✓ | ✓ | ✓ |
| SSO authentication | ✓ | ✓ | ✓ |
| Dialog authentication | ✓ | ✓ | ✓ |
| Analyze document | ✓ | ✓ | ✓ |
| Content control creation | ✓ | ✓ | ✓ |
| Navigate to clause | ✓ | ✓ | ✓ |
| Clear markers | ✓ | ✓ | ✓ |
| Ribbon commands | ✓ | ✓ | ✓ |
| Offline handling | ✓ | ✓ | N/A |
| Large document (50+ pages) | ✓ | ✓ | ✓ |

---

## 17. Performance Requirements

### 17.1 Performance Targets

| Metric | Target | Measurement |
|--------|--------|-------------|
| Task pane load time | < 2s | Time from click to interactive |
| Document extraction | < 3s | Time to extract 50-page document |
| Analysis submission | < 1s | Time from click to "queued" response |
| Full analysis | < 90s | End-to-end for typical NDA (5-10 pages) |
| Content control insertion | < 5s | Time to mark 20 clauses |
| Navigate to clause | < 500ms | Click to scroll complete |

### 17.2 Optimization Strategies

**Document Extraction:**

```typescript
// Batch paragraph loading to reduce round-trips
async function extractDocumentOptimized(): Promise<DocumentContent> {
  return Word.run(async (context) => {
    const body = context.document.body;
    body.load("text");

    const paragraphs = body.paragraphs;
    paragraphs.load("items/text, items/style");

    // Single sync for all loads
    await context.sync();

    return {
      fullText: body.text,
      paragraphs: paragraphs.items.map(p => ({
        text: p.text,
        style: p.style
      }))
    };
  });
}
```

**Content Control Batching:**

```typescript
// Insert all content controls in a single Word.run
async function markAllClauses(clauses: ClauseMarker[]): Promise<void> {
  await Word.run(async (context) => {
    for (const clause of clauses) {
      const searchResults = context.document.body.search(clause.text);
      searchResults.load("items");
    }

    await context.sync();

    // All searches complete, now insert controls
    for (let i = 0; i < clauses.length; i++) {
      const range = searchResults[i].items[0];
      if (range) {
        const control = range.insertContentControl();
        control.tag = `nda-analyst:${clauses[i].clauseId}`;
        control.color = getRiskColor(clauses[i].riskLevel);
      }
    }

    // Single sync for all insertions
    await context.sync();
  });
}
```

**Progress Update Throttling:**

```typescript
// Throttle UI updates to 100ms intervals
const throttledUpdate = throttle((progress: ProgressEvent) => {
  setAnalysisState(progress);
}, 100);
```

### 17.3 Large Document Handling

For documents exceeding 100 pages:

1. **Chunked extraction:** Extract text in 20-page chunks
2. **Progressive loading:** Show partial results as available
3. **Memory management:** Release paragraph references after extraction
4. **Warning threshold:** Display warning for documents > 200 pages

---

## 18. Cost Estimates

### 18.1 Development Costs

| Phase | Hours | Notes |
|-------|-------|-------|
| Phase 1: Foundation | 40-60 | Project setup, basic task pane, document extraction |
| Phase 2: Backend Integration | 40-60 | API endpoints, auth, progress streaming |
| Phase 3: Rich Interaction | 30-50 | Content controls, navigation, ribbon |
| Phase 4: Polish & Deploy | 20-30 | Testing, accessibility, deployment |
| **Total** | **130-200** | |

### 18.2 Infrastructure Costs (Incremental)

| Resource | Monthly Cost | Notes |
|----------|--------------|-------|
| Azure AD App Registration | $0 | Free tier |
| Additional Vercel bandwidth | ~$5 | Task pane assets |
| AppSource listing | $0 | Free to list |
| **Total incremental** | **~$5/mo** | |

### 18.3 Per-Analysis Costs

Same as web application:
- Voyage AI embeddings: ~$0.01
- Claude API: ~$1.10
- **Total: ~$1.11 per document**

### 18.4 Maintenance Costs

| Activity | Hours/Month |
|----------|-------------|
| Office.js updates | 2-4 |
| Bug fixes | 2-4 |
| Security patches | 1-2 |
| Feature requests | 4-8 |
| **Total** | **9-18** |

---

## 19. Milestones and Roadmap

### Phase 1: Foundation (Weeks 1-2)

**Goal:** Working task pane that can read documents

**Deliverables:**

- [ ] Word Add-in project scaffolding (Yeoman + React + TypeScript)
- [ ] Unified manifest with basic configuration
- [ ] Task pane shell with NDA Analyst branding
- [ ] Document text extraction via Office.js
- [ ] Development environment with sideloading
- [ ] Basic state management (Zustand)

**Exit Criteria:** Open Word → sideload add-in → click button → see document text in task pane

### Phase 2: Backend Integration (Weeks 3-4)

**Goal:** Full analysis pipeline working from Word

**Deliverables:**

- [ ] New API endpoints: `/api/word-addin/*`
- [ ] SSO authentication with Azure AD
- [ ] Dialog-based OAuth fallback
- [ ] Token exchange and session management
- [ ] Document submission to Inngest pipeline
- [ ] SSE progress streaming
- [ ] Results fetching and display
- [ ] Error handling and retry logic

**Exit Criteria:** Analyze real NDA → see clause list with risk scores in task pane

### Phase 3: Rich Document Interaction (Weeks 5-6)

**Goal:** Interactive clause marking and navigation

**Deliverables:**

- [ ] Content control insertion for each clause
- [ ] Color coding by risk level
- [ ] Click-to-navigate from task pane to document
- [ ] Scroll synchronization
- [ ] Clear all markers functionality
- [ ] Ribbon tab with commands
- [ ] Keyboard shortcuts

**Exit Criteria:** Clauses visually marked in document → click clause → document scrolls and highlights

### Phase 4: Polish and Deployment (Weeks 7-8)

**Goal:** Production-ready add-in

**Deliverables:**

- [ ] Comprehensive error states
- [ ] Loading skeletons and animations
- [ ] Offline detection and messaging
- [ ] Accessibility compliance (WCAG 2.1 AA)
- [ ] Cross-platform testing (Windows, Mac, Web)
- [ ] Centralized deployment documentation
- [ ] AppSource submission materials
- [ ] User documentation

**Exit Criteria:** IT admin can deploy to organization → users can analyze NDAs without support intervention

### Post-MVP Backlog

- [ ] Comparison mode (current document vs template)
- [ ] Annotations API integration
- [ ] Batch document analysis
- [ ] Offline result caching
- [ ] Export analysis to document comments
- [ ] Integration with SharePoint document libraries
- [ ] Custom clause library

---

## 20. Technical Decision Log

### TDR-WA-001: React over Office UI Fabric

**Decision:** Use React with custom styling instead of Office UI Fabric / Fluent UI.

**Context:** Office Add-ins commonly use Microsoft's Fluent UI for native look-and-feel.

**Rationale:**

- NDA Analyst web app already uses React + shadcn/ui
- Consistent design language across web and add-in
- Smaller bundle size (no Fluent UI dependency)
- Team familiarity with existing component library
- Custom theming for risk visualization not well-supported by Fluent

**Trade-offs:**

- Slightly different visual style from native Office UI
- Must implement accessibility features manually

### TDR-WA-002: SSE over WebSocket for Progress

**Decision:** Use Server-Sent Events (SSE) for progress updates instead of WebSocket.

**Context:** Need to stream analysis progress from backend to task pane.

**Rationale:**

- SSE is simpler to implement (one-way communication is sufficient)
- Works with standard HTTP infrastructure (no WebSocket upgrade)
- Automatic reconnection built into EventSource API
- Lower server resource usage than persistent WebSocket
- Vercel supports SSE out of the box

**Trade-offs:**

- Cannot send messages from client to server via same connection
- Browser connection limits (6 per domain) - not an issue for single-user add-in

### TDR-WA-003: Zustand over Redux

**Decision:** Use Zustand for client-side state management.

**Context:** Task pane needs to manage authentication state, analysis state, and UI state.

**Rationale:**

- Minimal boilerplate (compared to Redux)
- TypeScript-first design
- Small bundle size (~1KB)
- Persist middleware for localStorage token storage
- Already used in main NDA Analyst web app (consistency)

### TDR-WA-004: Unified Manifest over XML

**Decision:** Use the unified JSON manifest as primary, with XML fallback.

**Context:** Microsoft supports two manifest formats.

**Rationale:**

- JSON manifest is the modern standard (announced at Build 2024)
- Easier to maintain and version control
- Required for Copilot integration (future)
- Better alignment with Teams app manifest
- XML fallback covers older Office versions

**Trade-offs:**

- Must maintain two manifest files
- Some enterprise environments may only support XML

### TDR-WA-005: Content Controls over Comments

**Decision:** Use Word Content Controls for clause marking instead of Comments.

**Context:** Need to visually mark clauses in the document.

**Rationale:**

- Content controls can be color-coded by risk level
- Do not require "track changes" mode
- Persist with document when saved
- Can store custom metadata in tag/title
- Less intrusive than comments for printing

**Trade-offs:**

- May conflict with existing content controls in complex documents
- Cannot include rich text in the marker (like a comment can)

---

## 21. Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **SSO fails in enterprise environments** | Medium | High | Dialog auth fallback always available; detailed troubleshooting docs |
| **Content controls conflict with existing document structure** | Medium | Medium | Check for existing controls before insertion; provide "clear all" option |
| **Large documents cause performance issues** | Medium | Medium | Chunked extraction; progress indicators; warn for very large docs |
| **Azure AD app registration complexity** | Medium | Medium | Detailed setup guide; consider managed identity option |
| **AppSource review delays** | Medium | Low | Submit early; centralized deployment as primary path |
| **Office.js API breaking changes** | Low | High | Pin to specific requirement sets; monitor Office Dev blog |
| **Cross-platform inconsistencies** | Medium | Medium | Comprehensive testing matrix; feature detection patterns |
| **Task pane width constraints** | Low | Low | Responsive design; collapsible sections |
| **Network latency in task pane** | Medium | Medium | Optimistic UI; skeleton loaders; progress indication |
| **User confusion between web and add-in** | Medium | Low | Consistent branding; clear feature parity communication |

---

## 22. Competitive Analysis

### 22.1 Direct Competitors with Word Add-ins

| Product | Word Integration | AI Model | Pricing | Key Differentiator |
|---------|-----------------|----------|---------|-------------------|
| **Spellbook** | Native add-in | GPT-5 | $500+/mo | Broad contract types, redlining |
| **Kira** | Native add-in | Proprietary | Enterprise | Due diligence at scale |
| **Legartis** | Native add-in | Proprietary | Enterprise | Compliance focus |
| **ContractKen** | Native add-in | Multiple | $200+/mo | Playbook comparison |
| **goHeather** | Native add-in | GPT-4 | $100+/mo | Consumer-friendly |
| **Ivo** | Native add-in | Proprietary | Enterprise | Benchmark analysis |

### 22.2 NDA Analyst Differentiators

| Feature | NDA Analyst | Competitors |
|---------|-------------|-------------|
| **Open source** | ✅ Full codebase | ❌ All proprietary |
| **Free tier** | ✅ Available | ❌ Limited/none |
| **Evidence citations** | ✅ CUAD grounded | ⚠️ Some |
| **Self-hostable** | ✅ Yes | ❌ No |
| **Transparent methodology** | ✅ Documented | ❌ Black box |
| **NDA specialization** | ✅ Deep | ⚠️ Broad/general |

### 22.3 Market Positioning

**Target Segment:** Small law firms, in-house legal teams, startups, and individual attorneys who:

- Cannot afford $500+/month for contract AI
- Value transparency in AI-generated analysis
- Want evidence-based assessments, not just AI opinions
- Prefer tools that integrate with their Word-centric workflow
- Are comfortable with an open-source, community-supported tool

**Not Competing For:**

- Large enterprise due diligence (Kira, iManage)
- Full CLM suites (Ironclad, DocuSign)
- High-volume contract management

---

## 23. Open Questions

### Product Questions

1. **Should the add-in support document editing/generation?**
   - Current scope: analysis only
   - Future consideration: "Insert standard clause" feature

2. **How should we handle documents already analyzed via web?**
   - Option A: Re-analyze (fresh analysis)
   - Option B: Detect and show existing analysis
   - Decision: TBD based on user feedback

3. **Should content controls be optional?**
   - Some users may prefer clean documents
   - Consider: toggle in settings

### Technical Questions

4. **How to handle OOXML for table-heavy NDAs?**
   - Tables may contain key terms (definitions, schedules)
   - Research: table extraction patterns

5. **Should we support Word for iPad/iOS?**
   - Current: not in scope (limited APIs)
   - Decision: evaluate post-MVP based on demand

6. **Caching strategy for offline viewing?**
   - IndexedDB for previous analysis results
   - Decision: post-MVP feature

### Business Questions

7. **Monetization path for Word Add-in?**
   - Option A: Same free tier as web
   - Option B: Premium Word integration tier
   - Option C: Keep free as differentiator

8. **Support model for Word-specific issues?**
   - Who handles Office.js quirks?
   - How to triage Word vs. backend issues?

---

## 24. Appendices

### Appendix A: Office.js Requirement Sets

| Requirement Set | Minimum Office Version | Features |
|-----------------|----------------------|----------|
| WordApi 1.1 | Office 2016 (16.0.4266.1001) | Basic document access |
| WordApi 1.2 | Office 2016 (16.0.6769.2001) | Content controls, styles |
| WordApi 1.3 | Office 2019 (16.0.8010.0001) | Search, ranges, tables |
| WordApi 1.4 | Microsoft 365 (16.0.11126) | Content control events |
| WordApi 1.5 | Microsoft 365 (16.0.13425) | Annotations (preview) |
| WordApi 1.6 | Microsoft 365 (16.0.14326) | Custom XML parts |
| WordApiOnline 1.1 | Word Online | Web-specific APIs |

### Appendix B: Key Documentation Links

| Resource | URL |
|----------|-----|
| Office Add-ins Overview | https://learn.microsoft.com/office/dev/add-ins/overview/office-add-ins |
| Word JavaScript API | https://learn.microsoft.com/office/dev/add-ins/reference/overview/word-add-ins-reference-overview |
| Unified Manifest | https://learn.microsoft.com/office/dev/add-ins/develop/unified-manifest-overview |
| SSO Guide | https://learn.microsoft.com/office/dev/add-ins/develop/sso-in-office-add-ins |
| Content Controls | https://learn.microsoft.com/office/dev/add-ins/word/content-controls |
| Yeoman Generator | https://github.com/OfficeDev/generator-office |
| Centralized Deployment | https://learn.microsoft.com/microsoft-365/admin/manage/centralized-deployment-of-add-ins |
| AppSource Submission | https://learn.microsoft.com/partner-center/marketplace/submit-to-appsource-via-partner-center |

### Appendix C: Sample Test NDAs

For testing, use these sources:

1. **CUAD test set:** 100+ real NDAs with annotated clauses
2. **SEC EDGAR:** Public company NDAs from filings
3. **LawInsider:** Template NDAs with variable terms
4. **Bonterms Mutual NDA:** Standard template baseline

### Appendix D: Accessibility Requirements

| Requirement | Implementation |
|-------------|----------------|
| Keyboard navigation | All interactive elements focusable |
| Screen reader support | ARIA labels on all controls |
| Color contrast | 4.5:1 minimum ratio |
| Focus indicators | Visible focus rings |
| Error announcements | ARIA live regions for errors |
| Text scaling | Responsive to browser zoom |

---

*This PRD is a living document. Update as architectural decisions evolve during implementation.*
