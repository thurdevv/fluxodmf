import { money } from "@/lib/format";

export function Money({ value }: { value: number | string }) {
  return <span className="money-value">{money(value)}</span>;
}
