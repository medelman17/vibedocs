import type { SampleNDA } from "./index";

export const COMPLEX_NDA: SampleNDA = {
  id: "complex-nda",
  title: "Complex Multi-Party NDA",
  description:
    "A complex three-party NDA with tiered confidentiality, audit rights, insurance requirements, change of control, liquidated damages, and most favored nation provisions. Designed to exercise the full CUAD taxonomy.",
  complexity: "complex",
  expectedClauseCount: 22,
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
    "Audit Rights",
    "Insurance",
    "Change Of Control",
    "Revenue/Profit Sharing",
    "License Grant",
    "Non-Transferable License",
    "Most Favored Nation",
    "Liquidated Damages",
    "Warranty Duration",
    "Post-Termination Services",
    "Competitive Restriction Exception",
  ],
  rawText: `MULTI-PARTY CONFIDENTIALITY, NON-DISCLOSURE, AND RESTRICTIVE COVENANT AGREEMENT

This Agreement is entered into as of June 15, 2024 (the "Effective Date") by and among:

ARTICLE I - PARTIES

Section 1.1. Apex Genomics International, Inc., a Delaware corporation, 2100 Biotechnology Boulevard, Cambridge, MA 02142 ("Apex").

Section 1.2. Meridian Pharmaceutical Holdings, Ltd., incorporated under the laws of England and Wales, 45 Harley Street, London W1G 8QR, United Kingdom ("Meridian").

Section 1.3. Pacific Rim BioVentures, LLC, a California LLC, 1 Embarcadero Center, Suite 3000, San Francisco, CA 94111 ("Pacific Rim").

(each a "Party" and collectively the "Parties").

ARTICLE II - PURPOSE

Section 2.1. The Parties desire to evaluate a three-way strategic collaboration involving the integration of Apex's genomic platform with Meridian's compound screening, joint R&D of targeted therapeutics, and Pacific Rim's investment support (the "Purpose").

ARTICLE III - CONFIDENTIALITY TIERS

Section 3.1. Standard Confidential Information. All non-public information disclosed by any Party in connection with the Purpose, including business plans, financial data, customer lists, and technical specifications not designated as Highly Confidential.

Section 3.2. Highly Confidential Information. Information designated in writing as "HIGHLY CONFIDENTIAL," including: (a) proprietary genomic sequences and algorithms; (b) unpublished clinical trial data; (c) compound formulations and molecular structures; (d) patient data; and (e) investment term sheets and valuation models.

ARTICLE IV - OBLIGATIONS OF CONFIDENTIALITY

Section 4.1. Standard Obligations. Each Receiving Party shall: (a) maintain Standard Confidential Information in strict confidence; (b) use it solely for the Purpose; (c) limit access to employees and advisors bound by written confidentiality obligations; and (d) protect it with at least reasonable care.

Section 4.2. Enhanced Obligations. For Highly Confidential Information, each Receiving Party shall additionally: (a) restrict access to no more than five (5) named individuals per Party; (b) store only on encrypted systems with multi-factor authentication; (c) maintain detailed access logs; (d) notify the Disclosing Party within twenty-four (24) hours of any suspected breach; and (e) make no copies without prior written consent.

ARTICLE V - INTELLECTUAL PROPERTY AND LICENSE GRANTS

Section 5.1. Ownership. Each Party retains all right, title, and interest in its pre-existing intellectual property.

Section 5.2. Assignment of Joint Developments. Any intellectual property conceived jointly by personnel of two or more Parties as a direct result of the exchange of Confidential Information ("Joint Developments") shall be jointly owned. Each contributing Party hereby assigns to the other contributing Parties an undivided interest in such Joint Developments.

Section 5.3. Limited Evaluation License. Each Disclosing Party grants each Receiving Party a limited, non-exclusive, non-transferable, non-sublicensable, royalty-free license to use the Confidential Information solely for the Purpose during the term of this Agreement.

Section 5.4. Non-Transferable License Restriction. The license in Section 5.3 is personal to the Receiving Party and may not be assigned, transferred, or sublicensed to any third party without the Disclosing Party's prior written consent, which may be withheld in its sole discretion.

ARTICLE VI - NON-COMPETITION AND NON-SOLICITATION

Section 6.1. Non-Compete. During the term and for eighteen (18) months following termination, no Party shall directly or indirectly engage in the development, manufacture, or sale of any competing product within the United States, EU, UK, Japan, and Australia.

Section 6.2. Competitive Restriction Exception. A Party shall not be in violation if: (a) it was engaged in the competing activity prior to the Effective Date; (b) the activity arises from an acquisition where it constitutes less than fifteen percent (15%) of the acquired entity's revenue, provided divestiture within twelve (12) months; or (c) the activity is conducted by an affiliate without access to Confidential Information.

Section 6.3. Non-Solicitation. During the term and for two (2) years following termination, no Party shall solicit, recruit, or hire any employee or contractor of another Party involved in the Purpose.

ARTICLE VII - AUDIT RIGHTS

Section 7.1. Each Disclosing Party may, upon thirty (30) days' notice and no more than once per calendar year, audit the Receiving Party's compliance with this Agreement, including inspection of security measures and access logs. The cost shall be borne by the Disclosing Party unless the audit reveals a material breach.

ARTICLE VIII - INSURANCE

Section 8.1. Each Party shall maintain throughout the term and for three (3) years post-termination: (a) commercial general liability insurance of $10,000,000 per occurrence; (b) professional liability insurance of $5,000,000 per claim; and (c) cyber liability insurance of $10,000,000 per incident.

ARTICLE IX - CHANGE OF CONTROL

Section 9.1. Each Party shall promptly notify the others of any Change of Control (acquisition of >50% voting securities, merger where existing holders retain <50%, or sale of substantially all assets).

Section 9.2. Upon a Change of Control, each other Party may terminate this Agreement within sixty (60) days of receiving notice.

ARTICLE X - FINANCIAL PROVISIONS

Section 10.1. Revenue/Profit Sharing. No Party shall use Confidential Information to develop or sell revenue-generating products without the Disclosing Party's written consent and a separate revenue-sharing agreement. Unauthorized commercialization entitles the Disclosing Party to an equitable revenue share as determined by an independent arbitrator.

Section 10.2. Most Favored Nation. Each Party warrants that confidentiality and IP protections herein are no less favorable than those in similar agreements with third parties. If more favorable terms are granted elsewhere, this Agreement shall be amended upon request to provide equivalent protections.

ARTICLE XI - INDEMNIFICATION AND DAMAGES

Section 11.1. Indemnification. Each Party shall indemnify and hold harmless the other Parties from claims, damages, and expenses (including attorneys' fees) arising from: (a) breach of this Agreement; (b) unauthorized disclosure of Confidential Information; or (c) third-party claims from use of Confidential Information.

Section 11.2. Liquidated Damages. A breach of Section 4.2 (Highly Confidential) obligations shall result in liquidated damages of Two Million Dollars ($2,000,000) per occurrence, which the Parties agree represents a reasonable estimate of damages.

Section 11.3. Limitation of Liability. EXCEPT FOR BREACHES OF ARTICLES IV, VI, AND SECTION 11.2, NO PARTY'S AGGREGATE LIABILITY SHALL EXCEED ONE MILLION DOLLARS ($1,000,000). NO PARTY SHALL BE LIABLE FOR INDIRECT, CONSEQUENTIAL, OR PUNITIVE DAMAGES EXCEPT FOR WILLFUL MISCONDUCT.

ARTICLE XII - TERM AND TERMINATION

Section 12.1. Term. Five (5) years from the Effective Date.

Section 12.2. Termination for Convenience. Any Party may terminate upon ninety (90) days' prior written notice.

Section 12.3. Termination for Cause. Immediate termination upon: (a) uncured material breach after thirty (30) days' notice; (b) insolvency or bankruptcy; or (c) exercise of Change of Control termination right.

Section 12.4. Post-Termination. Upon termination: (a) return or destroy all Confidential Information within thirty (30) days; (b) Standard Confidential Information obligations survive five (5) years; (c) Highly Confidential obligations survive ten (10) years.

Section 12.5. Post-Termination Transition Services. For six (6) months following termination, each Party shall provide reasonable transition assistance including access to technical personnel for knowledge transfer, at cost without markup.

ARTICLE XIII - WARRANTIES

Section 13.1. Each Party warrants it has full authority to enter into this Agreement.

Section 13.2. Each Disclosing Party warrants that Confidential Information does not, to its knowledge, infringe third-party intellectual property rights.

Section 13.3. Warranty Duration. Warranties remain in effect for three (3) years following termination.

ARTICLE XIV - GENERAL PROVISIONS

Section 14.1. Notices shall be in writing, deemed given upon personal delivery, confirmed email, three (3) business days after certified mail, or one (1) business day after overnight courier.

Section 14.2. Governing Law. Laws of the State of New York, without regard to conflict of laws principles.

Section 14.3. Disputes resolved by binding AAA arbitration in New York before three (3) arbitrators.

Section 14.4. Amendment only by written instrument signed by all Parties.

Section 14.5. Severability. Invalid provisions shall not affect remaining provisions.

Section 14.6. Entire Agreement. Supersedes all prior understandings.

IN WITNESS WHEREOF, the Parties have executed this Agreement as of the Effective Date.

APEX GENOMICS INTERNATIONAL, INC.
By: _________________________ Dr. Emily Richardson, CEO

MERIDIAN PHARMACEUTICAL HOLDINGS, LTD.
By: _________________________ Sir James Crawford, QC, Chairman

PACIFIC RIM BIOVENTURES, LLC
By: _________________________ David Tanaka, Managing Partner`,
};
