import { canEdit, requireUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { todayWib } from "@/lib/format";
import { lookups } from "@/lib/lookups";
import { PageHeader } from "@/components/ui";
import { OrderForm } from "../order-form";

export default async function NewOrderPage() {
  const user = await requireUser();
  if (!canEdit(user)) redirect("/orders");
  const { products, csAgents } = await lookups();
  return (
    <>
      <PageHeader title="Order baru" />
      <OrderForm products={products} csAgents={csAgents} defaultCs={user.csCode} today={todayWib()} />
    </>
  );
}
