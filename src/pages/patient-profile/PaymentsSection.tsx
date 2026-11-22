import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CreditCard, Printer } from "lucide-react";
import { format } from "date-fns";
import type { Balance, Payment } from "@/api/clinic";
import { fmtDate } from "./utils";

interface PaymentsSectionProps {
  allPayments: Payment[] | undefined;
  balance: Balance | undefined;
}

/** "جميع المدفوعات" card: totals from the server balance + payments table with receipt buttons. */
export function PaymentsSection({ allPayments, balance }: PaymentsSectionProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>جميع المدفوعات</CardTitle>
      </CardHeader>
      <CardContent>
        {allPayments && allPayments.length > 0 ? (
          <>
            <div className="mb-4 p-4 bg-muted/50 rounded-lg">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
                <div>
                  <div className="text-2xl font-bold text-green-600">
                    {Math.round(balance?.total_paid_syp ?? 0).toLocaleString('en-US')} ل.س
                  </div>
                  <p className="text-sm text-muted-foreground">إجمالي المدفوعات بالليرة</p>
                </div>
                <div>
                  <div className="text-2xl font-bold text-green-600">
                    ${Math.round(balance?.total_paid_usd ?? 0).toLocaleString('en-US')}
                  </div>
                  <p className="text-sm text-muted-foreground">إجمالي المدفوعات بالدولار</p>
                </div>
                <div>
                  <div className="text-2xl font-bold text-blue-600">
                    {Math.round(balance?.total_cost_syp ?? 0).toLocaleString('en-US')} ل.س
                  </div>
                  <p className="text-sm text-muted-foreground">إجمالي تكلفة العلاجات بالليرة</p>
                </div>
                <div>
                  <div className="text-2xl font-bold text-blue-600">
                    ${Math.round(balance?.total_cost_usd ?? 0).toLocaleString('en-US')}
                  </div>
                  <p className="text-sm text-muted-foreground">إجمالي تكلفة العلاجات بالدولار</p>
                </div>
                <div>
                  <div className={`text-2xl font-bold ${balance?.syp && balance.syp > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {Math.round(Math.abs(balance?.syp || 0)).toLocaleString('en-US')} ل.س
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {balance?.syp && balance.syp > 0 ? 'المبلغ المستحق بالليرة' : 'رصيد زائد بالليرة'}
                  </p>
                </div>
                <div>
                  <div className={`text-2xl font-bold ${balance?.usd && balance.usd > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    ${Math.round(Math.abs(balance?.usd || 0)).toLocaleString('en-US')}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {balance?.usd && balance.usd > 0 ? 'المبلغ المستحق بالدولار' : 'رصيد زائد بالدولار'}
                  </p>
                </div>
              </div>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">تاريخ الدفع</TableHead>
                  <TableHead className="text-right">المبلغ</TableHead>
                  <TableHead className="text-right">العملة</TableHead>
                  <TableHead className="text-right">تاريخ الموعد</TableHead>
                  <TableHead className="text-right">الطبيب</TableHead>
                  <TableHead className="text-right">ملاحظات</TableHead>
                  <TableHead className="text-right">إيصال</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allPayments.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell>
                      {format(new Date(payment.paid_at), 'dd/MM/yyyy')}
                    </TableCell>
                    <TableCell className="font-semibold text-green-600">
                      {payment.currency === 'USD' ? '$' : ''}{Math.round(payment.amount).toLocaleString('en-US')}{payment.currency !== 'USD' ? ' ل.س' : ''}
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${payment.currency === 'USD' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'}`}>
                        {payment.currency === 'USD' ? 'دولار' : 'ليرة سورية'}
                      </span>
                    </TableCell>
                    <TableCell>
                      {fmtDate(payment.appointment?.scheduled_at)}
                    </TableCell>
                    <TableCell>
                      {payment.appointment?.doctor?.full_name || '-'}
                    </TableCell>
                    <TableCell>
                      {payment.notes || '-'}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        title="طباعة الإيصال"
                        aria-label="طباعة الإيصال"
                        onClick={() => window.open(`/print/receipt/${payment.id}`, "_blank")}
                      >
                        <Printer className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <CreditCard className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
            <p>لا توجد مدفوعات مسجلة لهذا المريض</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
