import type { SampleNDA } from "./index";

export const STANDARD_NDA: SampleNDA = {
  id: "standard-nda",
  title: "Standard Bilateral NDA",
  description:
    "A comprehensive bilateral NDA with non-compete, IP assignment, indemnification, and limitation of liability provisions. Suitable for technology partnerships.",
  complexity: "standard",
  expectedClauseCount: 12,
  expectedCategories: [
    "Parties",
    "Agreement Date",
    "Effective Date",
    "Expiration Date",
    "Governing Law",
    "Non-Compete",
    "No-Solicitation Of Employees",
    "Ip Ownership Assignment",
    "Cap On Liability",
    "Termination For Convenience",
    "Notice Period To Terminate Renewal",
  ],
  rawText: `CONFIDENTIAL DISCLOSURE AND NON-COMPETITION AGREEMENT

This Confidential Disclosure and Non-Competition Agreement ("Agreement") is entered into as of March 1, 2024 (the "Effective Date") by and between:

ARTICLE I - PARTIES

Section 1.1. Disclosing Party. Nexus Innovations, Inc., a Delaware corporation, with its principal place of business at 800 Market Street, Suite 1500, San Francisco, CA 94102 ("Nexus" or "Disclosing Party").

Section 1.2. Receiving Party. Quantum Dynamics Corp., a New York corporation, with its principal place of business at 350 Fifth Avenue, Suite 4500, New York, NY 10118 ("Quantum" or "Receiving Party").

ARTICLE II - PURPOSE AND SCOPE

Section 2.1. Purpose. The Parties are entering into this Agreement in connection with a potential strategic technology partnership involving the integration of Nexus's proprietary machine learning platform with Quantum's data analytics infrastructure (the "Purpose"). In connection with the Purpose, Nexus may disclose certain Confidential Information to Quantum.

ARTICLE III - CONFIDENTIAL INFORMATION

Section 3.1. Definition. "Confidential Information" means all non-public, confidential, or proprietary information disclosed by the Disclosing Party to the Receiving Party, whether disclosed orally, in writing, electronically, or by inspection, including without limitation: (a) trade secrets, inventions, ideas, processes, formulas, source and object code, data, programs, software, other works of authorship, know-how, improvements, discoveries, developments, designs, and techniques; (b) information regarding plans for research, development, new products, marketing and selling, business plans, budgets and unpublished financial statements, licenses, prices and costs, margins, discounts, credit terms, pricing and billing policies, quoting procedures, methods of obtaining business, forecasts, future plans and potential strategies, financial projections and business strategies; and (c) information regarding the skills and compensation of employees and contractors.

Section 3.2. Exclusions. Confidential Information shall not include information that: (a) is or becomes generally available to the public other than through a breach of this Agreement; (b) was available to the Receiving Party on a non-confidential basis before disclosure by the Disclosing Party; (c) is independently developed by the Receiving Party without reference to or use of the Confidential Information; or (d) becomes available to the Receiving Party on a non-confidential basis from a source other than the Disclosing Party, provided such source is not bound by a confidentiality agreement with the Disclosing Party.

ARTICLE IV - OBLIGATIONS OF RECEIVING PARTY

Section 4.1. Confidentiality. The Receiving Party shall: (a) maintain the Confidential Information in strict confidence; (b) not disclose the Confidential Information to any third party without the prior written consent of the Disclosing Party; (c) use the Confidential Information solely for the Purpose; and (d) limit access to the Confidential Information to its employees, officers, directors, and advisors who have a need to know and who are bound by obligations of confidentiality at least as restrictive as those contained herein.

Section 4.2. Standard of Care. The Receiving Party shall protect the Confidential Information using at least the same degree of care it uses to protect its own most sensitive confidential information, but in no event less than a reasonable standard of care.

ARTICLE V - NON-COMPETITION

Section 5.1. Non-Compete Obligation. During the term of this Agreement and for a period of one (1) year following its termination or expiration (the "Restricted Period"), the Receiving Party shall not, directly or indirectly, engage in, own, manage, operate, control, be employed by, participate in, or be connected in any manner with the ownership, management, operation, or control of any business that directly competes with the Disclosing Party's machine learning platform products within the geographic territories where the Disclosing Party conducts business as of the date of termination.

Section 5.2. Non-Solicitation of Employees. During the Restricted Period, the Receiving Party shall not, directly or indirectly, solicit, recruit, hire, or attempt to hire any employee or independent contractor of the Disclosing Party, or induce or attempt to induce any such person to leave the employ or service of the Disclosing Party.

ARTICLE VI - INTELLECTUAL PROPERTY

Section 6.1. Ownership of Pre-Existing IP. Each Party retains all right, title, and interest in and to its pre-existing intellectual property. Nothing in this Agreement grants either Party any license or rights to the other Party's intellectual property except as expressly set forth herein.

Section 6.2. Assignment of Developed IP. Any inventions, improvements, developments, or works of authorship conceived, created, or reduced to practice by the Receiving Party, solely or jointly, as a direct result of access to the Confidential Information ("Developed IP") shall be the sole and exclusive property of the Disclosing Party. The Receiving Party hereby irrevocably assigns to the Disclosing Party all right, title, and interest in and to such Developed IP, including all intellectual property rights therein.

ARTICLE VII - INDEMNIFICATION AND LIABILITY

Section 7.1. Indemnification. The Receiving Party shall indemnify, defend, and hold harmless the Disclosing Party and its officers, directors, employees, agents, successors, and assigns from and against any and all claims, damages, losses, liabilities, costs, and expenses (including reasonable attorneys' fees) arising out of or relating to any breach of this Agreement by the Receiving Party.

Section 7.2. Limitation of Liability. IN NO EVENT SHALL EITHER PARTY BE LIABLE TO THE OTHER PARTY FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES ARISING OUT OF OR RELATED TO THIS AGREEMENT, REGARDLESS OF WHETHER SUCH DAMAGES ARE BASED ON CONTRACT, TORT, STRICT LIABILITY, OR ANY OTHER THEORY, EVEN IF THE PARTY HAS BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES. THE AGGREGATE LIABILITY OF EITHER PARTY UNDER THIS AGREEMENT SHALL NOT EXCEED FIVE HUNDRED THOUSAND DOLLARS ($500,000).

ARTICLE VIII - TERM AND TERMINATION

Section 8.1. Term. This Agreement shall commence on the Effective Date and shall continue for a period of three (3) years, unless earlier terminated in accordance with this Article VIII.

Section 8.2. Termination for Convenience. Either Party may terminate this Agreement at any time upon sixty (60) days' prior written notice to the other Party.

Section 8.3. Survival. The obligations of confidentiality, non-competition, non-solicitation, intellectual property assignment, and indemnification shall survive termination or expiration of this Agreement for the periods specified herein or, if no period is specified, for a period of five (5) years.

ARTICLE IX - GENERAL PROVISIONS

Section 9.1. Notices. All notices, requests, consents, claims, demands, and other communications under this Agreement shall be in writing and shall be delivered by certified mail, return receipt requested, or by nationally recognized overnight courier to the respective addresses set forth in Article I, or to such other address as a Party may designate by written notice.

Section 9.2. Amendment. This Agreement may not be amended, modified, or supplemented except by a written instrument signed by both Parties.

Section 9.3. Governing Law. This Agreement shall be governed by and construed in accordance with the laws of the State of Delaware, without regard to its conflict of laws provisions.

Section 9.4. Dispute Resolution. Any dispute arising out of or relating to this Agreement shall be resolved exclusively in the state or federal courts located in Wilmington, Delaware, and each Party consents to the personal jurisdiction of such courts.

Section 9.5. Entire Agreement. This Agreement constitutes the entire agreement between the Parties with respect to the subject matter hereof and supersedes all prior and contemporaneous understandings, agreements, representations, and warranties, both written and oral.

IN WITNESS WHEREOF, the Parties have executed this Agreement as of the Effective Date.

NEXUS INNOVATIONS, INC.

By: _________________________
Name: Michael Chen
Title: Chief Technology Officer
Date: March 1, 2024

QUANTUM DYNAMICS CORP.

By: _________________________
Name: Sarah Rodriguez
Title: General Counsel
Date: March 1, 2024`,
};
