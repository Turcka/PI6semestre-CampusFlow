import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { Button, Card, Input, Label, PageHeader, Select, Spinner } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { v1Api } from '@/lib/api';

type Rule = {
  id?: string;
  weekday: number;
  start_time: string;
  end_time: string;
  slot_duration_minutes: number;
  capacity: number;
  campus_id?: string;
};

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export function AvailabilityPage() {
  const { me } = useAuth();
  const campusId = me?.campuses[0]?.id;
  const queryClient = useQueryClient();
  const [weekday, setWeekday] = useState(1);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('12:00');

  const rulesQuery = useQuery({
    queryKey: ['availability', 'rules'],
    queryFn: () => v1Api<Rule[]>('/availability/rules'),
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!campusId) throw new Error('Nenhum campus vinculado ao tenant.');
      const existing = (rulesQuery.data ?? []).map((rule) => ({
        weekday: rule.weekday,
        startTime: String(rule.start_time).slice(0, 5),
        endTime: String(rule.end_time).slice(0, 5),
        slotDurationMinutes: rule.slot_duration_minutes,
        capacity: rule.capacity,
      }));
      const next = [
        ...existing.filter((rule) => !(rule.weekday === weekday && rule.startTime === startTime)),
        {
          weekday,
          startTime,
          endTime,
          slotDurationMinutes: 60,
          capacity: 1,
        },
      ];
      return v1Api('/availability/rules', {
        method: 'PUT',
        body: JSON.stringify({ campusId, rules: next }),
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['availability', 'rules'] });
    },
  });

  const generateMutation = useMutation({
    mutationFn: () => {
      const from = new Date().toISOString().slice(0, 10);
      const toDate = new Date();
      toDate.setDate(toDate.getDate() + 30);
      return v1Api('/scheduling/slots/generate', {
        method: 'POST',
        body: JSON.stringify({ from, to: toDate.toISOString().slice(0, 10) }),
      });
    },
  });

  if (rulesQuery.isLoading) return <Spinner />;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Disponibilidade"
        description="Defina sua grade semanal e gere slots para os próximos 30 dias."
      />

      <Card className="space-y-3">
        <h2 className="font-semibold">Regras atuais</h2>
        <ul className="space-y-2 text-sm">
          {(rulesQuery.data ?? []).map((rule) => (
            <li key={`${rule.weekday}-${rule.start_time}-${rule.end_time}`} className="rounded-xl bg-slate-50 px-3 py-2">
              {WEEKDAYS[rule.weekday]} · {String(rule.start_time).slice(0, 5)}–{String(rule.end_time).slice(0, 5)}
            </li>
          ))}
          {!(rulesQuery.data ?? []).length ? <li className="text-slate-500">Nenhuma regra cadastrada.</li> : null}
        </ul>
      </Card>

      <Card className="grid gap-3 sm:grid-cols-3">
        <div>
          <Label>Dia</Label>
          <Select value={weekday} onChange={(e) => setWeekday(Number(e.target.value))}>
            {WEEKDAYS.map((label, index) => (
              <option key={label} value={index}>
                {label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Início</Label>
          <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
        </div>
        <div>
          <Label>Fim</Label>
          <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
        </div>
        <div className="sm:col-span-3 flex flex-wrap gap-2">
          <Button disabled={saveMutation.isPending || !campusId} onClick={() => saveMutation.mutate()}>
            Salvar regra
          </Button>
          <Button variant="secondary" disabled={generateMutation.isPending} onClick={() => generateMutation.mutate()}>
            Gerar slots (30 dias)
          </Button>
        </div>
        {saveMutation.isError ? <p className="sm:col-span-3 text-sm text-rose-600">{(saveMutation.error as Error).message}</p> : null}
        {generateMutation.isSuccess ? (
          <p className="sm:col-span-3 text-sm text-emerald-700">Slots gerados: {JSON.stringify(generateMutation.data)}</p>
        ) : null}
      </Card>
    </div>
  );
}
