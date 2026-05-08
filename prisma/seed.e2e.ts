/**
 * Seed reproductible E2E : tenant, pharmacie, admin RBAC,
 * TVA / dépôt / caisse, produit + lot + stock, vente de test.
 * Import client généré (output Prisma configuré dans schema.prisma).
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "@prisma/client";
import * as bcrypt from "bcrypt";
import { Pool } from "pg";

const url = process.env.DATABASE_URL;
if (!url?.trim()) {
  throw new Error("DATABASE_URL is missing in environment.");
}
const pool = new Pool({ connectionString: url.trim() });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const FIXED_IDS = {
  tenantId: "11111111-1111-4111-8111-111111111111",
  pharmacyId: "22222222-2222-4222-8222-222222222222",
  userId: "33333333-3333-4333-8333-333333333333",
  warehouseId: "44444444-4444-4444-8444-444444444444",
  customerId: "55555555-5555-4555-8555-555555555555",
  productId: "66666666-6666-4666-8666-666666666666",
  batchId: "77777777-7777-4777-8777-777777777777",
  cashAccountId: "88888888-8888-4888-8888-888888888888",
  saleId: "99999999-9999-4999-8999-999999999999",
  saleLineId: "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa",
} as const;

async function wipe() {
  await prisma.auditLog.deleteMany({});
  await prisma.financeTransaction.deleteMany({});
  await prisma.customerCredit.deleteMany({});
  await prisma.saleReturnLine.deleteMany({});
  await prisma.saleReturn.deleteMany({});
  await prisma.salePayment.deleteMany({});
  await prisma.saleLine.deleteMany({});
  await prisma.sale.deleteMany({});
  await prisma.stockMovement.deleteMany({});
  await prisma.stockBalance.deleteMany({});
  await prisma.productPrice.deleteMany({});
  await prisma.productBatch.deleteMany({});
  await prisma.product.deleteMany({});
  await prisma.customer.deleteMany({});
  await prisma.supplier.deleteMany({});
  await prisma.purchaseInvoiceLine.deleteMany({});
  await prisma.purchaseInvoice.deleteMany({});
  await prisma.purchaseOrderLine.deleteMany({});
  await prisma.purchaseOrder.deleteMany({});
  await prisma.cashSession.deleteMany({});
  await prisma.register.deleteMany({});
  await prisma.journalEntryLine.deleteMany({});
  await prisma.journalEntry.deleteMany({});
  await prisma.chartOfAccounts.deleteMany({});
  await prisma.vatDeclaration.deleteMany({});
  await prisma.taxPeriod.deleteMany({});
  await prisma.backupRun.deleteMany({});
  await prisma.backupProfile.deleteMany({});
  await prisma.syncConflict.deleteMany({});
  await prisma.syncJob.deleteMany({});
  await prisma.userRole.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.rolePermission.deleteMany({});
  await prisma.permission.deleteMany({});
  await prisma.role.deleteMany({});
  await prisma.category.deleteMany({});
  await prisma.taxRate.deleteMany({});
  await prisma.warehouse.deleteMany({});
  await prisma.cashAccount.deleteMany({});
  await prisma.bankAccount.deleteMany({});
  await prisma.pharmacySetting.deleteMany({});
  await prisma.pharmacy.deleteMany({});
  await prisma.tenant.deleteMany({});
}

async function main() {
  await wipe();

  const permissions: [string, string, string][] = [
    ["sales.read", "Voir ventes", "sales"],
    ["sales.create", "Créer vente", "sales"],
    ["sales.refund", "Créer retour vente", "sales"],
    ["sales.return.approve", "Approuver retour vente", "sales"],
    ["sales.return.refund", "Rembourser retour vente", "sales"],
    ["sales.credit.use", "Utiliser avoir client", "sales"],
    ["products.read", "Voir produits", "products"],
    ["products.create", "Créer produit", "products"],
    ["products.update", "Modifier produit", "products"],
    ["products.delete", "Désactiver produit", "products"],
    ["stock.adjust", "Ajuster stock", "stock"],
    ["users.manage", "Gérer utilisateurs", "security"],
  ];

  for (const [code, label, module] of permissions) {
    await prisma.permission.create({ data: { code, label, module } });
  }

  const adminRole = await prisma.role.create({
    data: { code: "ADMIN_PHARMACY", label: "Admin Pharmacie" },
  });

  const allPerms = await prisma.permission.findMany({ select: { id: true } });
  await prisma.rolePermission.createMany({
    data: allPerms.map((p) => ({ roleId: adminRole.id, permissionId: p.id })),
  });

  const tenant = await prisma.tenant.create({
    data: {
      id: FIXED_IDS.tenantId,
      name: "Tenant E2E",
      plan: "starter",
      status: "active",
    },
  });

  const pharmacy = await prisma.pharmacy.create({
    data: {
      id: FIXED_IDS.pharmacyId,
      tenantId: tenant.id,
      legalName: "Pharmacie E2E SARL",
      tradeName: "Pharmacie E2E",
      taxId: "TN-E2E-001",
      email: "contact-e2e@pharmacie.tn",
      phone: "+21611111111",
    },
  });

  await prisma.pharmacySetting.create({
    data: {
      pharmacyId: pharmacy.id,
      defaultReturnWindowDays: 7,
      requireManagerApprovalOver: new Prisma.Decimal("200"),
      allowExpiredReturn: false,
    },
  });

  const passwordHash = await bcrypt.hash("Admin@123", 10);
  const admin = await prisma.user.create({
    data: {
      id: FIXED_IDS.userId,
      pharmacyId: pharmacy.id,
      fullName: "Admin E2E",
      email: "admin@pharmacie.tn",
      passwordHash,
      status: "active",
    },
  });

  await prisma.userRole.create({
    data: { userId: admin.id, roleId: adminRole.id },
  });

  const tax = await prisma.taxRate.create({
    data: {
      pharmacyId: pharmacy.id,
      name: "TVA 19%",
      rate: new Prisma.Decimal("19.00"),
      isDefault: true,
    },
  });

  const warehouse = await prisma.warehouse.create({
    data: {
      id: FIXED_IDS.warehouseId,
      pharmacyId: pharmacy.id,
      name: "Dépôt Principal",
      type: "main",
    },
  });

  await prisma.cashAccount.create({
    data: {
      id: FIXED_IDS.cashAccountId,
      pharmacyId: pharmacy.id,
      name: "Caisse Principale",
      currency: "TND",
      isDefault: true,
    },
  });

  const customer = await prisma.customer.create({
    data: {
      id: FIXED_IDS.customerId,
      pharmacyId: pharmacy.id,
      code: "CLI-E2E-001",
      fullName: "Client Test E2E",
      phone: "+21622222222",
    },
  });

  const product = await prisma.product.create({
    data: {
      id: FIXED_IDS.productId,
      pharmacyId: pharmacy.id,
      sku: "SKU-E2E-001",
      barcode: "6190000000011",
      name: "Paracetamol 500mg",
      unit: "box",
      form: "tablet",
      requiresPrescription: false,
      isActive: true,
    },
  });

  const batch = await prisma.productBatch.create({
    data: {
      id: FIXED_IDS.batchId,
      productId: product.id,
      batchNumber: "LOT-E2E-001",
      expiryDate: new Date("2027-12-31"),
      purchaseCost: new Prisma.Decimal("3.500"),
    },
  });

  await prisma.productPrice.create({
    data: {
      productId: product.id,
      salePrice: new Prisma.Decimal("5.000"),
      purchasePrice: new Prisma.Decimal("3.500"),
      taxRateId: tax.id,
      effectiveFrom: new Date(),
    },
  });

  const balance = await prisma.stockBalance.create({
    data: {
      warehouseId: warehouse.id,
      productId: product.id,
      batchId: batch.id,
      quantityOnHand: new Prisma.Decimal("100.000"),
      quantityReserved: new Prisma.Decimal("0"),
    },
  });

  const qty = new Prisma.Decimal("2");
  const unitPrice = new Prisma.Decimal("5.000");
  const gross = qty.mul(unitPrice);
  const taxAmount = gross.mul(new Prisma.Decimal("19")).div(new Prisma.Decimal("100"));
  const total = gross.plus(taxAmount);

  const sale = await prisma.sale.create({
    data: {
      id: FIXED_IDS.saleId,
      pharmacyId: pharmacy.id,
      saleNumber: "SALE-E2E-0001",
      customerId: customer.id,
      cashierId: admin.id,
      status: "completed",
      paymentStatus: "paid",
      subtotal: gross,
      discountTotal: new Prisma.Decimal("0"),
      taxTotal: taxAmount,
      total,
      lines: {
        create: [
          {
            id: FIXED_IDS.saleLineId,
            productId: product.id,
            batchId: batch.id,
            qty,
            unitPrice,
            discount: new Prisma.Decimal("0"),
            taxRate: new Prisma.Decimal("19.00"),
            lineTotal: total,
          },
        ],
      },
      payments: {
        create: [
          {
            paymentMethod: "cash",
            amount: total,
            paidAt: new Date(),
            reference: "seed-e2e-cash",
          },
        ],
      },
    },
    include: { lines: true },
  });

  await prisma.stockMovement.create({
    data: {
      pharmacyId: pharmacy.id,
      warehouseId: warehouse.id,
      productId: product.id,
      batchId: batch.id,
      movementType: "out",
      qty,
      unitCost: new Prisma.Decimal("3.500"),
      referenceType: "sale",
      referenceId: sale.id,
      movedBy: admin.id,
      note: "Seed e2e — sortie vente",
    },
  });

  await prisma.stockBalance.update({
    where: { id: balance.id },
    data: { quantityOnHand: new Prisma.Decimal("98.000") },
  });

  const cashAccount = await prisma.cashAccount.findFirstOrThrow({
    where: { pharmacyId: pharmacy.id, isDefault: true },
  });

  console.log("Seed E2E OK");
  console.log("Login: admin@pharmacie.tn / Admin@123");
  console.log("pharmacyId:", pharmacy.id);
  console.log("saleId:", sale.id);
  console.log("saleLineId:", sale.lines[0].id);
  console.log("warehouseId:", warehouse.id);
  console.log("productId:", product.id);
  console.log("customerId:", customer.id);
  console.log("cashAccountId:", cashAccount.id);
}

main()
  .catch((e) => {
    console.error("Seed E2E error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
