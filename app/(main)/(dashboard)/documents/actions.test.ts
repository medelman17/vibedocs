// app/(dashboard)/documents/actions.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { testDb } from "@/test/setup";
import {
  createTestUser,
  createTestOrg,
  createTestMembership,
  createTestDocument,
  createTestChunk,
  resetFactoryCounter,
} from "@/test/factories";

// Store mock state at module level
let mockTenantContext: {
  db: typeof testDb;
  userId: string;
  user: { id: string; name: string; email: string };
  tenantId: string;
  role: string;
} | null = null;

// Mock the DAL module with inline implementation
vi.mock("@/lib/dal", () => ({
  withTenant: vi.fn(async () => {
    if (!mockTenantContext) {
      throw new Error("REDIRECT:/onboarding");
    }
    return mockTenantContext;
  }),
  verifySession: vi.fn(async () => {
    if (!mockTenantContext) {
      throw new Error("REDIRECT:/login");
    }
    return {
      userId: mockTenantContext.userId,
      user: mockTenantContext.user,
      activeOrganizationId: mockTenantContext.tenantId,
    };
  }),
  requireRole: vi.fn(async (allowedRoles: string[]) => {
    if (!mockTenantContext) {
      throw new Error("REDIRECT:/onboarding");
    }
    if (!allowedRoles.includes(mockTenantContext.role)) {
      throw new Error("REDIRECT:/dashboard?error=unauthorized");
    }
    return mockTenantContext;
  }),
}));

// Mock blob module (for actions that use it)
vi.mock("@/lib/blob", () => ({
  uploadFile: vi.fn(),
  deleteFile: vi.fn(),
  computeContentHash: vi.fn(),
}));

// Helper to set up tenant context for tests
function setupTenantContext(params: {
  user: { id: string; name: string | null; email: string };
  org: { id: string };
  membership: { role: string };
}): void {
  mockTenantContext = {
    db: testDb,
    userId: params.user.id,
    user: {
      id: params.user.id,
      name: params.user.name ?? "Test User",
      email: params.user.email,
    },
    tenantId: params.org.id,
    role: params.membership.role,
  };
}

describe("documents/actions", () => {
  beforeEach(() => {
    mockTenantContext = null;
    resetFactoryCounter();
    vi.resetModules();
  });

  describe("uploadDocument", () => {
    it("uploads a valid PDF file", async () => {
      const user = await createTestUser();
      const org = await createTestOrg();
      await createTestMembership(org.id, user.id, "owner");
      setupTenantContext({ user, org, membership: { role: "owner" } });

      // Mock blob functions
      const { uploadFile, computeContentHash } = await import("@/lib/blob");
      vi.mocked(computeContentHash).mockResolvedValue("hash-abc123");
      vi.mocked(uploadFile).mockResolvedValue({
        url: "https://blob.test/uploaded.pdf",
      } as never);

      const formData = new FormData();
      const file = new File(["test content"], "test.pdf", {
        type: "application/pdf",
      });
      formData.append("file", file);
      formData.append("title", "Test NDA");

      const { uploadDocument } = await import("./actions");
      const result = await uploadDocument(formData);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.title).toBe("Test NDA");
        expect(result.data.status).toBe("pending");
        expect(result.data.fileUrl).toBe("https://blob.test/uploaded.pdf");
      }
    });

    it("uploads a valid DOCX file", async () => {
      const user = await createTestUser();
      const org = await createTestOrg();
      await createTestMembership(org.id, user.id, "owner");
      setupTenantContext({ user, org, membership: { role: "owner" } });

      const { uploadFile, computeContentHash } = await import("@/lib/blob");
      vi.mocked(computeContentHash).mockResolvedValue("hash-docx123");
      vi.mocked(uploadFile).mockResolvedValue({
        url: "https://blob.test/uploaded.docx",
      } as never);

      const formData = new FormData();
      const file = new File(["test content"], "test.docx", {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });
      formData.append("file", file);

      const { uploadDocument } = await import("./actions");
      const result = await uploadDocument(formData);

      expect(result.success).toBe(true);
      if (result.success) {
        // Title extracted from filename
        expect(result.data.title).toBe("test");
      }
    });

    it("returns error when no file provided", async () => {
      const user = await createTestUser();
      const org = await createTestOrg();
      await createTestMembership(org.id, user.id, "owner");
      setupTenantContext({ user, org, membership: { role: "owner" } });

      const formData = new FormData();

      const { uploadDocument } = await import("./actions");
      const result = await uploadDocument(formData);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe("VALIDATION_ERROR");
        expect(result.error.message).toContain("No file provided");
      }
    });

    it("returns error for invalid file type", async () => {
      const user = await createTestUser();
      const org = await createTestOrg();
      await createTestMembership(org.id, user.id, "owner");
      setupTenantContext({ user, org, membership: { role: "owner" } });

      const formData = new FormData();
      const file = new File(["test content"], "test.txt", {
        type: "text/plain",
      });
      formData.append("file", file);

      const { uploadDocument } = await import("./actions");
      const result = await uploadDocument(formData);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe("VALIDATION_ERROR");
        expect(result.error.message).toContain("Invalid file type");
      }
    });

    it("returns error for file exceeding size limit", async () => {
      const user = await createTestUser();
      const org = await createTestOrg();
      await createTestMembership(org.id, user.id, "owner");
      setupTenantContext({ user, org, membership: { role: "owner" } });

      const formData = new FormData();
      // Create a mock File with size > 10MB
      const largeContent = new ArrayBuffer(11 * 1024 * 1024);
      const file = new File([largeContent], "large.pdf", {
        type: "application/pdf",
      });
      formData.append("file", file);

      const { uploadDocument } = await import("./actions");
      const result = await uploadDocument(formData);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe("VALIDATION_ERROR");
        expect(result.error.message).toContain("10MB");
      }
    });

    it("returns error for duplicate content", async () => {
      const user = await createTestUser();
      const org = await createTestOrg();
      await createTestMembership(org.id, user.id, "owner");
      setupTenantContext({ user, org, membership: { role: "owner" } });

      // Create existing document with same hash
      await createTestDocument(org.id, {
        title: "Existing Doc",
        contentHash: "duplicate-hash",
      });

      const { computeContentHash } = await import("@/lib/blob");
      vi.mocked(computeContentHash).mockResolvedValue("duplicate-hash");

      const formData = new FormData();
      const file = new File(["test content"], "test.pdf", {
        type: "application/pdf",
      });
      formData.append("file", file);

      const { uploadDocument } = await import("./actions");
      const result = await uploadDocument(formData);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe("DUPLICATE");
        expect(result.error.message).toContain("Existing Doc");
      }
    });

    it("extracts title from filename when not provided", async () => {
      const user = await createTestUser();
      const org = await createTestOrg();
      await createTestMembership(org.id, user.id, "owner");
      setupTenantContext({ user, org, membership: { role: "owner" } });

      const { uploadFile, computeContentHash } = await import("@/lib/blob");
      vi.mocked(computeContentHash).mockResolvedValue("hash-xyz");
      vi.mocked(uploadFile).mockResolvedValue({
        url: "https://blob.test/doc.pdf",
      } as never);

      const formData = new FormData();
      const file = new File(["test content"], "Acme NDA Agreement.pdf", {
        type: "application/pdf",
      });
      formData.append("file", file);

      const { uploadDocument } = await import("./actions");
      const result = await uploadDocument(formData);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.title).toBe("Acme NDA Agreement");
      }
    });
  });

  describe("getDocuments", () => {
    it("returns documents for the current tenant", async () => {
      // Setup
      const user = await createTestUser();
      const org = await createTestOrg();
      await createTestMembership(org.id, user.id, "owner");
      setupTenantContext({ user, org, membership: { role: "owner" } });

      // Create test documents
      await createTestDocument(org.id, { title: "Doc 1", status: "complete" });
      await createTestDocument(org.id, { title: "Doc 2", status: "pending" });

      // Import and call
      const { getDocuments } = await import("./actions");
      const result = await getDocuments({});

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(2);
        expect(result.data.map((d) => d.title)).toContain("Doc 1");
        expect(result.data.map((d) => d.title)).toContain("Doc 2");
      }
    });

    it("filters by status when provided", async () => {
      const user = await createTestUser();
      const org = await createTestOrg();
      await createTestMembership(org.id, user.id, "owner");
      setupTenantContext({ user, org, membership: { role: "owner" } });

      await createTestDocument(org.id, {
        title: "Complete Doc",
        status: "complete",
      });
      await createTestDocument(org.id, {
        title: "Pending Doc",
        status: "pending",
      });

      const { getDocuments } = await import("./actions");
      const result = await getDocuments({ status: "pending" });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(1);
        expect(result.data[0].title).toBe("Pending Doc");
      }
    });

    it("excludes soft-deleted documents", async () => {
      const user = await createTestUser();
      const org = await createTestOrg();
      await createTestMembership(org.id, user.id, "owner");
      setupTenantContext({ user, org, membership: { role: "owner" } });

      await createTestDocument(org.id, { title: "Active Doc" });
      await createTestDocument(org.id, {
        title: "Deleted Doc",
        deletedAt: new Date(),
      });

      const { getDocuments } = await import("./actions");
      const result = await getDocuments({});

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(1);
        expect(result.data[0].title).toBe("Active Doc");
      }
    });

    it("respects pagination parameters", async () => {
      const user = await createTestUser();
      const org = await createTestOrg();
      await createTestMembership(org.id, user.id, "owner");
      setupTenantContext({ user, org, membership: { role: "owner" } });

      // Create 5 documents
      for (let i = 1; i <= 5; i++) {
        await createTestDocument(org.id, { title: `Doc ${i}` });
      }

      const { getDocuments } = await import("./actions");
      const result = await getDocuments({ limit: 2, offset: 0 });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(2);
      }
    });

    it("isolates documents by tenant", async () => {
      // Setup tenant 1
      const user1 = await createTestUser();
      const org1 = await createTestOrg({ slug: "org-1" });
      await createTestMembership(org1.id, user1.id, "owner");

      // Setup tenant 2
      const user2 = await createTestUser();
      const org2 = await createTestOrg({ slug: "org-2" });
      await createTestMembership(org2.id, user2.id, "owner");

      // Create documents in each tenant
      await createTestDocument(org1.id, { title: "Org1 Doc" });
      await createTestDocument(org2.id, { title: "Org2 Doc" });

      // Query as tenant 1
      setupTenantContext({
        user: user1,
        org: org1,
        membership: { role: "owner" },
      });
      const { getDocuments } = await import("./actions");
      const result = await getDocuments({});

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(1);
        expect(result.data[0].title).toBe("Org1 Doc");
      }
    });
  });

  describe("searchDocuments", () => {
    it("searches documents by title (case-insensitive)", async () => {
      const user = await createTestUser();
      const org = await createTestOrg();
      await createTestMembership(org.id, user.id, "owner");
      setupTenantContext({ user, org, membership: { role: "owner" } });

      await createTestDocument(org.id, { title: "Acme NDA Agreement" });
      await createTestDocument(org.id, { title: "Beta Corp Contract" });
      await createTestDocument(org.id, { title: "acme confidentiality" });

      const { searchDocuments } = await import("./actions");
      const result = await searchDocuments({ query: "acme" });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(2);
      }
    });

    it("returns empty array when no matches found", async () => {
      const user = await createTestUser();
      const org = await createTestOrg();
      await createTestMembership(org.id, user.id, "owner");
      setupTenantContext({ user, org, membership: { role: "owner" } });

      await createTestDocument(org.id, { title: "Some Document" });

      const { searchDocuments } = await import("./actions");
      const result = await searchDocuments({ query: "nonexistent" });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(0);
      }
    });

    it("validates query is not empty", async () => {
      const user = await createTestUser();
      const org = await createTestOrg();
      await createTestMembership(org.id, user.id, "owner");
      setupTenantContext({ user, org, membership: { role: "owner" } });

      const { searchDocuments } = await import("./actions");
      const result = await searchDocuments({ query: "" });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe("VALIDATION_ERROR");
      }
    });
  });

  describe("getDocument", () => {
    it("returns a single document by ID", async () => {
      const user = await createTestUser();
      const org = await createTestOrg();
      await createTestMembership(org.id, user.id, "owner");
      setupTenantContext({ user, org, membership: { role: "owner" } });

      const doc = await createTestDocument(org.id, { title: "My Document" });

      const { getDocument } = await import("./actions");
      const result = await getDocument({ documentId: doc.id });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.id).toBe(doc.id);
        expect(result.data.title).toBe("My Document");
      }
    });

    it("returns NOT_FOUND for non-existent document", async () => {
      const user = await createTestUser();
      const org = await createTestOrg();
      await createTestMembership(org.id, user.id, "owner");
      setupTenantContext({ user, org, membership: { role: "owner" } });

      const { getDocument } = await import("./actions");
      const result = await getDocument({
        documentId: "00000000-0000-0000-0000-000000000000",
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe("NOT_FOUND");
      }
    });

    it("returns NOT_FOUND for soft-deleted document", async () => {
      const user = await createTestUser();
      const org = await createTestOrg();
      await createTestMembership(org.id, user.id, "owner");
      setupTenantContext({ user, org, membership: { role: "owner" } });

      const doc = await createTestDocument(org.id, { deletedAt: new Date() });

      const { getDocument } = await import("./actions");
      const result = await getDocument({ documentId: doc.id });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe("NOT_FOUND");
      }
    });

    it("returns NOT_FOUND for document in another tenant", async () => {
      const user1 = await createTestUser();
      const org1 = await createTestOrg({ slug: "org-1" });
      await createTestMembership(org1.id, user1.id, "owner");

      const user2 = await createTestUser();
      const org2 = await createTestOrg({ slug: "org-2" });
      await createTestMembership(org2.id, user2.id, "owner");

      // Create doc in org2
      const doc = await createTestDocument(org2.id, { title: "Other Org Doc" });

      // Query as org1
      setupTenantContext({
        user: user1,
        org: org1,
        membership: { role: "owner" },
      });
      const { getDocument } = await import("./actions");
      const result = await getDocument({ documentId: doc.id });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe("NOT_FOUND");
      }
    });

    it("validates document ID format", async () => {
      const user = await createTestUser();
      const org = await createTestOrg();
      await createTestMembership(org.id, user.id, "owner");
      setupTenantContext({ user, org, membership: { role: "owner" } });

      const { getDocument } = await import("./actions");
      const result = await getDocument({ documentId: "not-a-uuid" });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe("VALIDATION_ERROR");
      }
    });
  });

  describe("getDocumentWithChunks", () => {
    it("returns document with its chunks", async () => {
      const user = await createTestUser();
      const org = await createTestOrg();
      await createTestMembership(org.id, user.id, "owner");
      setupTenantContext({ user, org, membership: { role: "owner" } });

      const doc = await createTestDocument(org.id, { title: "Chunked Doc" });
      await createTestChunk(org.id, doc.id, 0, { content: "First chunk" });
      await createTestChunk(org.id, doc.id, 1, { content: "Second chunk" });

      const { getDocumentWithChunks } = await import("./actions");
      const result = await getDocumentWithChunks({ documentId: doc.id });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.id).toBe(doc.id);
        expect(result.data.chunks).toHaveLength(2);
        expect(result.data.chunks[0].content).toBe("First chunk");
        expect(result.data.chunks[1].content).toBe("Second chunk");
      }
    });

    it("returns empty chunks array when document has no chunks", async () => {
      const user = await createTestUser();
      const org = await createTestOrg();
      await createTestMembership(org.id, user.id, "owner");
      setupTenantContext({ user, org, membership: { role: "owner" } });

      const doc = await createTestDocument(org.id);

      const { getDocumentWithChunks } = await import("./actions");
      const result = await getDocumentWithChunks({ documentId: doc.id });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.chunks).toHaveLength(0);
      }
    });
  });

  describe("updateDocumentTitle", () => {
    it("updates the document title", async () => {
      const user = await createTestUser();
      const org = await createTestOrg();
      await createTestMembership(org.id, user.id, "owner");
      setupTenantContext({ user, org, membership: { role: "owner" } });

      const doc = await createTestDocument(org.id, { title: "Old Title" });

      const { updateDocumentTitle } = await import("./actions");
      const result = await updateDocumentTitle({
        documentId: doc.id,
        title: "New Title",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.title).toBe("New Title");
      }
    });

    it("trims whitespace from title", async () => {
      const user = await createTestUser();
      const org = await createTestOrg();
      await createTestMembership(org.id, user.id, "owner");
      setupTenantContext({ user, org, membership: { role: "owner" } });

      const doc = await createTestDocument(org.id);

      const { updateDocumentTitle } = await import("./actions");
      const result = await updateDocumentTitle({
        documentId: doc.id,
        title: "  Trimmed Title  ",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.title).toBe("Trimmed Title");
      }
    });

    it("rejects empty title", async () => {
      const user = await createTestUser();
      const org = await createTestOrg();
      await createTestMembership(org.id, user.id, "owner");
      setupTenantContext({ user, org, membership: { role: "owner" } });

      const doc = await createTestDocument(org.id);

      const { updateDocumentTitle } = await import("./actions");
      const result = await updateDocumentTitle({
        documentId: doc.id,
        title: "",
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe("VALIDATION_ERROR");
      }
    });

    it("returns NOT_FOUND for non-existent document", async () => {
      const user = await createTestUser();
      const org = await createTestOrg();
      await createTestMembership(org.id, user.id, "owner");
      setupTenantContext({ user, org, membership: { role: "owner" } });

      const { updateDocumentTitle } = await import("./actions");
      const result = await updateDocumentTitle({
        documentId: "00000000-0000-0000-0000-000000000000",
        title: "New Title",
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe("NOT_FOUND");
      }
    });
  });

  describe("deleteDocument", () => {
    it("soft-deletes a document", async () => {
      const user = await createTestUser();
      const org = await createTestOrg();
      await createTestMembership(org.id, user.id, "owner");
      setupTenantContext({ user, org, membership: { role: "owner" } });

      const doc = await createTestDocument(org.id);

      const { deleteDocument } = await import("./actions");
      const result = await deleteDocument({ documentId: doc.id });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.deletedAt).not.toBeNull();
      }
    });

    it("returns NOT_FOUND for already deleted document", async () => {
      const user = await createTestUser();
      const org = await createTestOrg();
      await createTestMembership(org.id, user.id, "owner");
      setupTenantContext({ user, org, membership: { role: "owner" } });

      const doc = await createTestDocument(org.id, { deletedAt: new Date() });

      const { deleteDocument } = await import("./actions");
      const result = await deleteDocument({ documentId: doc.id });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe("NOT_FOUND");
      }
    });
  });

  describe("hardDeleteDocument", () => {
    it("permanently deletes a soft-deleted document", async () => {
      const user = await createTestUser();
      const org = await createTestOrg();
      await createTestMembership(org.id, user.id, "owner");
      setupTenantContext({ user, org, membership: { role: "owner" } });

      const doc = await createTestDocument(org.id, {
        title: "To Delete",
        deletedAt: new Date(),
        fileUrl: "https://blob.test/doc.pdf",
      });

      const { deleteFile } = await import("@/lib/blob");
      vi.mocked(deleteFile).mockResolvedValue(undefined);

      const { hardDeleteDocument } = await import("./actions");
      const result = await hardDeleteDocument({ documentId: doc.id });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.message).toContain("permanently deleted");
      }

      // Verify document is actually gone
      const { getDocument } = await import("./actions");
      const checkResult = await getDocument({ documentId: doc.id });
      expect(checkResult.success).toBe(false);
    });

    it("deletes associated chunks before document", async () => {
      const user = await createTestUser();
      const org = await createTestOrg();
      await createTestMembership(org.id, user.id, "owner");
      setupTenantContext({ user, org, membership: { role: "owner" } });

      const doc = await createTestDocument(org.id, { deletedAt: new Date() });
      await createTestChunk(org.id, doc.id, 0, { content: "Chunk 1" });
      await createTestChunk(org.id, doc.id, 1, { content: "Chunk 2" });

      const { deleteFile } = await import("@/lib/blob");
      vi.mocked(deleteFile).mockResolvedValue(undefined);

      const { hardDeleteDocument } = await import("./actions");
      const result = await hardDeleteDocument({ documentId: doc.id });

      expect(result.success).toBe(true);
    });

    it("returns NOT_FOUND for non-deleted document", async () => {
      const user = await createTestUser();
      const org = await createTestOrg();
      await createTestMembership(org.id, user.id, "owner");
      setupTenantContext({ user, org, membership: { role: "owner" } });

      const doc = await createTestDocument(org.id); // not soft-deleted

      const { hardDeleteDocument } = await import("./actions");
      const result = await hardDeleteDocument({ documentId: doc.id });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe("NOT_FOUND");
        expect(result.error.message).toContain("Soft-delete");
      }
    });

    it("returns NOT_FOUND for non-existent document", async () => {
      const user = await createTestUser();
      const org = await createTestOrg();
      await createTestMembership(org.id, user.id, "owner");
      setupTenantContext({ user, org, membership: { role: "owner" } });

      const { hardDeleteDocument } = await import("./actions");
      const result = await hardDeleteDocument({
        documentId: "00000000-0000-0000-0000-000000000000",
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe("NOT_FOUND");
      }
    });

    it("continues even if blob deletion fails", async () => {
      const user = await createTestUser();
      const org = await createTestOrg();
      await createTestMembership(org.id, user.id, "owner");
      setupTenantContext({ user, org, membership: { role: "owner" } });

      const doc = await createTestDocument(org.id, {
        deletedAt: new Date(),
        fileUrl: "https://blob.test/doc.pdf",
      });

      const { deleteFile } = await import("@/lib/blob");
      vi.mocked(deleteFile).mockRejectedValue(new Error("Blob error"));

      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const { hardDeleteDocument } = await import("./actions");
      const result = await hardDeleteDocument({ documentId: doc.id });

      expect(result.success).toBe(true); // Should still succeed
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it("handles document without file URL", async () => {
      const user = await createTestUser();
      const org = await createTestOrg();
      await createTestMembership(org.id, user.id, "owner");
      setupTenantContext({ user, org, membership: { role: "owner" } });

      const doc = await createTestDocument(org.id, {
        deletedAt: new Date(),
        fileUrl: null,
      });

      const { hardDeleteDocument } = await import("./actions");
      const result = await hardDeleteDocument({ documentId: doc.id });

      expect(result.success).toBe(true);
    });
  });

  describe("restoreDocument", () => {
    it("restores a soft-deleted document", async () => {
      const user = await createTestUser();
      const org = await createTestOrg();
      await createTestMembership(org.id, user.id, "owner");
      setupTenantContext({ user, org, membership: { role: "owner" } });

      const doc = await createTestDocument(org.id, { deletedAt: new Date() });

      const { restoreDocument } = await import("./actions");
      const result = await restoreDocument({ documentId: doc.id });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.deletedAt).toBeNull();
      }
    });

    it("returns NOT_FOUND for non-deleted document", async () => {
      const user = await createTestUser();
      const org = await createTestOrg();
      await createTestMembership(org.id, user.id, "owner");
      setupTenantContext({ user, org, membership: { role: "owner" } });

      const doc = await createTestDocument(org.id); // not deleted

      const { restoreDocument } = await import("./actions");
      const result = await restoreDocument({ documentId: doc.id });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe("NOT_FOUND");
      }
    });
  });

  describe("retryDocumentProcessing", () => {
    it("resets failed document to pending status", async () => {
      const user = await createTestUser();
      const org = await createTestOrg();
      await createTestMembership(org.id, user.id, "owner");
      setupTenantContext({ user, org, membership: { role: "owner" } });

      const doc = await createTestDocument(org.id, {
        status: "failed",
        errorMessage: "Processing failed",
      });

      const { retryDocumentProcessing } = await import("./actions");
      const result = await retryDocumentProcessing({ documentId: doc.id });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe("pending");
        expect(result.data.errorMessage).toBeNull();
      }
    });

    it("rejects retry for non-failed documents", async () => {
      const user = await createTestUser();
      const org = await createTestOrg();
      await createTestMembership(org.id, user.id, "owner");
      setupTenantContext({ user, org, membership: { role: "owner" } });

      const doc = await createTestDocument(org.id, { status: "complete" });

      const { retryDocumentProcessing } = await import("./actions");
      const result = await retryDocumentProcessing({ documentId: doc.id });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe("BAD_REQUEST");
      }
    });
  });

  describe("getDocumentDownloadUrl", () => {
    it("returns download URL for document with file", async () => {
      const user = await createTestUser();
      const org = await createTestOrg();
      await createTestMembership(org.id, user.id, "owner");
      setupTenantContext({ user, org, membership: { role: "owner" } });

      const doc = await createTestDocument(org.id, {
        fileUrl: "https://blob.test/doc.pdf",
        fileName: "document.pdf",
      });

      const { getDocumentDownloadUrl } = await import("./actions");
      const result = await getDocumentDownloadUrl({ documentId: doc.id });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.url).toBe("https://blob.test/doc.pdf");
        expect(result.data.fileName).toBe("document.pdf");
      }
    });

    it("returns BAD_REQUEST for document without file URL", async () => {
      const user = await createTestUser();
      const org = await createTestOrg();
      await createTestMembership(org.id, user.id, "owner");
      setupTenantContext({ user, org, membership: { role: "owner" } });

      const doc = await createTestDocument(org.id, { fileUrl: null });

      const { getDocumentDownloadUrl } = await import("./actions");
      const result = await getDocumentDownloadUrl({ documentId: doc.id });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe("BAD_REQUEST");
      }
    });
  });

  describe("getDashboardStats", () => {
    it("returns correct counts by status", async () => {
      const user = await createTestUser();
      const org = await createTestOrg();
      await createTestMembership(org.id, user.id, "owner");
      setupTenantContext({ user, org, membership: { role: "owner" } });

      // Create documents with various statuses
      await createTestDocument(org.id, { status: "pending" });
      await createTestDocument(org.id, { status: "pending" });
      await createTestDocument(org.id, { status: "parsing" });
      await createTestDocument(org.id, { status: "complete" });
      await createTestDocument(org.id, { status: "complete" });
      await createTestDocument(org.id, { status: "complete" });
      await createTestDocument(org.id, { status: "failed" });

      const { getDashboardStats } = await import("./actions");
      const result = await getDashboardStats();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.totalDocuments).toBe(7);
        expect(result.data.pendingDocuments).toBe(2);
        expect(result.data.processingDocuments).toBe(1); // parsing
        expect(result.data.completedDocuments).toBe(3);
        expect(result.data.failedDocuments).toBe(1);
      }
    });

    it("excludes soft-deleted documents from counts", async () => {
      const user = await createTestUser();
      const org = await createTestOrg();
      await createTestMembership(org.id, user.id, "owner");
      setupTenantContext({ user, org, membership: { role: "owner" } });

      await createTestDocument(org.id, { status: "complete" });
      await createTestDocument(org.id, {
        status: "complete",
        deletedAt: new Date(),
      });

      const { getDashboardStats } = await import("./actions");
      const result = await getDashboardStats();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.totalDocuments).toBe(1);
        expect(result.data.completedDocuments).toBe(1);
      }
    });

    it("returns zeros when no documents exist", async () => {
      const user = await createTestUser();
      const org = await createTestOrg();
      await createTestMembership(org.id, user.id, "owner");
      setupTenantContext({ user, org, membership: { role: "owner" } });

      const { getDashboardStats } = await import("./actions");
      const result = await getDashboardStats();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.totalDocuments).toBe(0);
        expect(result.data.pendingDocuments).toBe(0);
        expect(result.data.processingDocuments).toBe(0);
        expect(result.data.completedDocuments).toBe(0);
        expect(result.data.failedDocuments).toBe(0);
      }
    });
  });
});
