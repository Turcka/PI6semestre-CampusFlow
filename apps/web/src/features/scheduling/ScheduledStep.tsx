import { Link } from 'react-router-dom';

import { Badge, Button, Card } from '@/components/ui';
import { parseTstzrange, formatDateTime } from '@/lib/format';

type Props = {
  visitId: string;
  status: string;
  period: string;
  professorRequested?: boolean;
  portalToken: string;
};

export function ScheduledStep({ visitId, status, period, professorRequested, portalToken }: Props) {
  const range = parseTstzrange(period);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Visita solicitada!</h2>
        <p className="mt-1 text-sm text-slate-600">
          Agora um promotor precisa aceitar o convite. Você receberá um e-mail quando a visita for confirmada.
        </p>
      </div>

      <Card className="space-y-3">
        <Badge status={status} />
        {range ? (
          <p className="text-lg font-semibold text-slate-900">{formatDateTime(range.start)}</p>
        ) : (
          <p className="text-sm text-slate-600">Horário registrado.</p>
        )}
        {professorRequested ? (
          <p className="text-sm text-slate-600">Um professor também foi solicitado para esta visita.</p>
        ) : null}
        <p className="text-xs text-slate-500">Código da visita: {visitId}</p>
      </Card>

      <div className="flex flex-col gap-2">
        <Link to={`/minha-visita?token=${portalToken}`}>
          <Button className="w-full">Acompanhar minha visita</Button>
        </Link>
        <Link to="/">
          <Button variant="secondary" className="w-full">
            Voltar ao início
          </Button>
        </Link>
      </div>
    </div>
  );
}
