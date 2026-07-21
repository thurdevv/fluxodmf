import { ActionType, PaymentStatus } from "@prisma-generated/enums";
import { handleApiError, ok } from "@/lib/api";
import { requireTab } from "@/lib/auth";
import { numberValue } from "@/lib/finance-management";
import { prisma } from "@/lib/db";

const round = (value: number) => Number(value.toFixed(2));

export async function GET() {
  try {
    await requireTab("indicadores");
    const now = new Date();
    const yearAgo = new Date(now);
    yearAgo.setUTCFullYear(yearAgo.getUTCFullYear() - 1);
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setUTCDate(thirtyDaysAgo.getUTCDate() - 30);
    const sixtyDaysAgo = new Date(now);
    sixtyDaysAgo.setUTCDate(sixtyDaysAgo.getUTCDate() - 60);

    const [payments, actions] = await Promise.all([
      prisma.payment.findMany({
        where: { createdAt: { gte: yearAgo } },
        include: { work: true, allocations: { include: { work: true } } },
      }),
      prisma.paymentAction.findMany({
        where: { createdAt: { gte: yearAgo } },
        include: { payment: { select: { createdAt: true } } },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    const activePayments = payments.filter(
      (payment) =>
        payment.status !== PaymentStatus.REPROVADO &&
        payment.status !== PaymentStatus.CANCELADO,
    );
    const supplierMap = new Map<string, { count: number; amount: number }>();
    const workMap = new Map<string, { count: number; amount: number }>();
    const categoryPeriods = new Map<string, { current: number; previous: number }>();
    const monthlyMap = new Map<string, number>();

    for (const payment of activePayments) {
      const amount = numberValue(payment.amount);
      const supplier = supplierMap.get(payment.supplierName) ?? { count: 0, amount: 0 };
      supplier.count += 1;
      supplier.amount += amount;
      supplierMap.set(payment.supplierName, supplier);

      const allocations = payment.allocations.length
        ? payment.allocations.map((allocation) => ({ name: allocation.work.name, amount: numberValue(allocation.amount) }))
        : [{ name: payment.work.name, amount }];
      for (const allocation of allocations) {
        const work = workMap.get(allocation.name) ?? { count: 0, amount: 0 };
        work.count += 1;
        work.amount += allocation.amount;
        workMap.set(allocation.name, work);
        const month = payment.currentDueDate.toISOString().slice(0, 7);
        const key = `${month}|${allocation.name}`;
        monthlyMap.set(key, (monthlyMap.get(key) ?? 0) + allocation.amount);
      }

      const category = payment.category || "(sem categoria)";
      const periods = categoryPeriods.get(category) ?? { current: 0, previous: 0 };
      if (payment.createdAt >= thirtyDaysAgo) periods.current += amount;
      else if (payment.createdAt >= sixtyDaysAgo) periods.previous += amount;
      categoryPeriods.set(category, periods);
    }

    const completedApprovals = actions.filter(
      (action) => action.type === ActionType.APROVAR && action.newStatus === PaymentStatus.APROVADO,
    );
    const averageApprovalHours = completedApprovals.length
      ? completedApprovals.reduce(
          (sum, action) => sum + (action.createdAt.getTime() - action.payment.createdAt.getTime()) / 3_600_000,
          0,
        ) / completedApprovals.length
      : 0;
    const rejectionReasons = new Map<string, number>();
    for (const action of actions.filter((item) => item.type === ActionType.REPROVAR)) {
      const reason = action.reason || "Sem motivo informado";
      rejectionReasons.set(reason, (rejectionReasons.get(reason) ?? 0) + 1);
    }
    const receiptEligible = activePayments.filter((payment) => payment.currentDueDate <= now);
    const receiptsOnTime = receiptEligible.filter(
      (payment) => payment.hasReceipt && payment.receiptReceivedAt && payment.receiptReceivedAt <= payment.currentDueDate,
    ).length;

    return ok({
      totals: {
        amount: round(activePayments.reduce((sum, payment) => sum + numberValue(payment.amount), 0)),
        payments: activePayments.length,
        averageApprovalHours: round(averageApprovalHours),
        reschedules: actions.filter((action) => action.type === ActionType.TRANSFERIR).length,
        receiptOnTimeRate: receiptEligible.length ? round((receiptsOnTime / receiptEligible.length) * 100) : 0,
        receiptEligible: receiptEligible.length,
      },
      suppliers: [...supplierMap.entries()]
        .map(([name, value]) => ({ name, count: value.count, amount: round(value.amount) }))
        .sort((a, b) => b.amount - a.amount).slice(0, 12),
      works: [...workMap.entries()]
        .map(([name, value]) => ({ name, count: value.count, amount: round(value.amount) }))
        .sort((a, b) => b.amount - a.amount),
      categoryGrowth: [...categoryPeriods.entries()]
        .map(([category, value]) => ({
          category,
          current: round(value.current),
          previous: round(value.previous),
          growth: value.previous ? round(((value.current - value.previous) / value.previous) * 100) : value.current ? 100 : 0,
        }))
        .sort((a, b) => b.current - a.current).slice(0, 12),
      rejectionReasons: [...rejectionReasons.entries()]
        .map(([reason, count]) => ({ reason, count }))
        .sort((a, b) => b.count - a.count).slice(0, 10),
      monthlyByWork: [...monthlyMap.entries()]
        .map(([key, amount]) => {
          const [month, work] = key.split("|");
          return { month, work, amount: round(amount) };
        })
        .sort((a, b) => a.month.localeCompare(b.month)),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
