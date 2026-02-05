import type { SampleNDA } from "./index";

export const SHORT_NDA: SampleNDA = {
  id: "short-nda",
  title: "Simple Mutual NDA",
  description:
    "A short mutual non-disclosure agreement between two parties. Covers basic confidentiality terms with a 2-year duration.",
  complexity: "short",
  expectedClauseCount: 6,
  expectedCategories: [
    "Parties",
    "Agreement Date",
    "Effective Date",
    "Expiration Date",
    "Governing Law",
  ],
  rawText: `MUTUAL NON-DISCLOSURE AGREEMENT

This Mutual Non-Disclosure Agreement ("Agreement") is entered into as of January 15, 2024 (the "Effective Date") by and between:

Acme Technologies, Inc., a Delaware corporation with its principal office at 123 Innovation Drive, San Francisco, CA 94105 ("Acme")

and

Beta Solutions LLC, a California limited liability company with its principal office at 456 Commerce Street, Los Angeles, CA 90001 ("Beta")

(each a "Party" and collectively the "Parties").

RECITALS

WHEREAS, the Parties wish to explore a potential business relationship (the "Purpose") and in connection therewith may disclose certain confidential and proprietary information to each other.

NOW, THEREFORE, in consideration of the mutual promises and covenants contained herein, the Parties agree as follows:

1. DEFINITION OF CONFIDENTIAL INFORMATION

"Confidential Information" means any and all non-public information, in any form or medium, disclosed by either Party (the "Disclosing Party") to the other Party (the "Receiving Party"), whether orally, in writing, electronically, or by inspection of tangible objects, including but not limited to: trade secrets, business plans, financial information, customer lists, technical data, product designs, software code, marketing strategies, and any other proprietary information.

Confidential Information does not include information that: (a) is or becomes publicly available through no fault of the Receiving Party; (b) was known to the Receiving Party prior to disclosure; (c) is independently developed by the Receiving Party without use of the Confidential Information; or (d) is rightfully obtained from a third party without restriction on disclosure.

2. NON-DISCLOSURE OBLIGATIONS

The Receiving Party agrees to: (a) hold the Confidential Information in strict confidence; (b) not disclose the Confidential Information to any third party without the prior written consent of the Disclosing Party; (c) use the Confidential Information solely for the Purpose; and (d) protect the Confidential Information using the same degree of care it uses to protect its own confidential information, but in no event less than reasonable care.

3. TERM AND TERMINATION

This Agreement shall remain in effect for a period of two (2) years from the Effective Date, unless earlier terminated by either Party upon thirty (30) days' prior written notice to the other Party. The obligations of confidentiality shall survive termination of this Agreement for a period of three (3) years.

4. RETURN OF MATERIALS

Upon termination of this Agreement or upon request by the Disclosing Party, the Receiving Party shall promptly return or destroy all materials containing Confidential Information and certify in writing that it has done so.

5. GOVERNING LAW

This Agreement shall be governed by and construed in accordance with the laws of the State of California, without regard to its conflict of laws principles.

6. ENTIRE AGREEMENT

This Agreement constitutes the entire agreement between the Parties with respect to the subject matter hereof and supersedes all prior negotiations, representations, warranties, commitments, offers, and agreements, whether written or oral.

IN WITNESS WHEREOF, the Parties have executed this Agreement as of the Effective Date.

ACME TECHNOLOGIES, INC.

By: _________________________
Name: John Smith
Title: Chief Executive Officer
Date: January 15, 2024

BETA SOLUTIONS LLC

By: _________________________
Name: Jane Doe
Title: Managing Director
Date: January 15, 2024`,
};
