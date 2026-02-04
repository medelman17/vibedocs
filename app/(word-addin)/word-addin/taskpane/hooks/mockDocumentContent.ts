/**
 * @fileoverview Mock Document Content for Dev Mode
 *
 * Provides sample NDA content for testing the Word Add-in
 * outside of the Office environment.
 */

export interface Paragraph {
  text: string
  style: string
  isHeading: boolean
  /** Outline level for headings (0 = body text, 1-9 = heading levels) */
  outlineLevel: number
}

export interface DocumentContent {
  fullText: string
  paragraphs: Paragraph[]
  title: string
  /** Document properties from Word */
  properties: {
    author?: string
    creationDate?: Date
    lastModifiedBy?: string
    lastModified?: Date
    /** Word version for debugging */
    wordVersion?: string
  }
}

/**
 * Sample NDA content for development testing.
 * Contains various clause types for testing the analysis pipeline.
 */
export const MOCK_NDA_CONTENT: DocumentContent = {
  title: "Sample Non-Disclosure Agreement",
  paragraphs: [
    {
      text: "NON-DISCLOSURE AGREEMENT",
      style: "Heading1",
      isHeading: true,
      outlineLevel: 1,
    },
    {
      text: 'This Non-Disclosure Agreement ("Agreement") is entered into as of January 1, 2025, by and between Acme Corporation ("Disclosing Party") and Recipient Inc. ("Receiving Party").',
      style: "Normal",
      isHeading: false,
      outlineLevel: 0,
    },
    {
      text: "1. DEFINITION OF CONFIDENTIAL INFORMATION",
      style: "Heading2",
      isHeading: true,
      outlineLevel: 2,
    },
    {
      text: '"Confidential Information" means any and all non-public information, including but not limited to technical, business, financial, customer, and operational information, disclosed by the Disclosing Party to the Receiving Party, whether orally, in writing, or in any other form.',
      style: "Normal",
      isHeading: false,
      outlineLevel: 0,
    },
    {
      text: "2. OBLIGATIONS OF RECEIVING PARTY",
      style: "Heading2",
      isHeading: true,
      outlineLevel: 2,
    },
    {
      text: "The Receiving Party agrees to: (a) hold the Confidential Information in strict confidence; (b) not disclose the Confidential Information to any third parties without prior written consent; (c) use the Confidential Information solely for the purpose of evaluating a potential business relationship.",
      style: "Normal",
      isHeading: false,
      outlineLevel: 0,
    },
    {
      text: "3. TERM AND TERMINATION",
      style: "Heading2",
      isHeading: true,
      outlineLevel: 2,
    },
    {
      text: "This Agreement shall remain in effect for a period of three (3) years from the Effective Date. The confidentiality obligations shall survive termination and continue for five (5) years thereafter.",
      style: "Normal",
      isHeading: false,
      outlineLevel: 0,
    },
    {
      text: "4. NON-COMPETE CLAUSE",
      style: "Heading2",
      isHeading: true,
      outlineLevel: 2,
    },
    {
      text: "During the term of this Agreement and for a period of two (2) years following termination, the Receiving Party shall not directly or indirectly engage in any business that competes with the Disclosing Party within the United States.",
      style: "Normal",
      isHeading: false,
      outlineLevel: 0,
    },
    {
      text: "5. INDEMNIFICATION",
      style: "Heading2",
      isHeading: true,
      outlineLevel: 2,
    },
    {
      text: "The Receiving Party shall indemnify, defend, and hold harmless the Disclosing Party from and against any and all claims, damages, losses, and expenses arising from any breach of this Agreement by the Receiving Party.",
      style: "Normal",
      isHeading: false,
      outlineLevel: 0,
    },
    {
      text: "6. GOVERNING LAW",
      style: "Heading2",
      isHeading: true,
      outlineLevel: 2,
    },
    {
      text: "This Agreement shall be governed by and construed in accordance with the laws of the State of Delaware, without regard to its conflict of laws principles.",
      style: "Normal",
      isHeading: false,
      outlineLevel: 0,
    },
    {
      text: "7. ASSIGNMENT",
      style: "Heading2",
      isHeading: true,
      outlineLevel: 2,
    },
    {
      text: "The Receiving Party may not assign or transfer this Agreement or any rights or obligations hereunder without the prior written consent of the Disclosing Party.",
      style: "Normal",
      isHeading: false,
      outlineLevel: 0,
    },
    {
      text: "8. ENTIRE AGREEMENT",
      style: "Heading2",
      isHeading: true,
      outlineLevel: 2,
    },
    {
      text: "This Agreement constitutes the entire agreement between the parties with respect to the subject matter hereof and supersedes all prior negotiations, representations, or agreements relating thereto.",
      style: "Normal",
      isHeading: false,
      outlineLevel: 0,
    },
  ],
  fullText: "",
  properties: {
    author: "Legal Department",
    creationDate: new Date("2025-01-01"),
    lastModifiedBy: "John Smith",
    lastModified: new Date("2025-01-15"),
    wordVersion: "Mock Dev Mode",
  },
}

// Generate fullText from paragraphs
MOCK_NDA_CONTENT.fullText = MOCK_NDA_CONTENT.paragraphs
  .map((p) => p.text)
  .join("\n\n")
