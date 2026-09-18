import { cpfSchema } from '@campusflow/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Button, FieldError, Input, Label, Select, Spinner } from '@/components/ui';
import { publicApi } from '@/lib/api';
import { maskCpf, maskPhoneBr, phoneToE164, unmaskDigits } from '@/lib/format';
import { queryKeys } from '@/lib/query-keys';

const schema = z.object({
  fullName: z.string().trim().min(3, 'Informe o nome completo'),
  cpf: z.string().min(11, 'CPF inválido'),
  email: z.string().email('E-mail inválido'),
  phone: z.string().min(10, 'Telefone inválido'),
  courseId: z.string().uuid('Selecione um curso'),
  lgpdConsent: z.boolean().refine((value) => value === true, {
    message: 'É necessário aceitar a política de privacidade.',
  }),
});

type FormValues = z.infer<typeof schema>;

export type CampusPublic = {
  id: string;
  name: string;
  slug: string;
  address: string | null;
  tenant_id: string;
  tenants?: { name?: string } | null;
  courses: Array<{ id: string; name: string; code: string | null; description: string | null }>;
};

type Props = {
  campusSlug: string;
  onRegistered: (payload: { sessionId: string; portalToken: string; candidateId: string; campusId: string }) => void;
};

export function RegisterStep({ campusSlug, onRegistered }: Props) {
  const campusQuery = useQuery({
    queryKey: queryKeys.campus(campusSlug),
    queryFn: () => publicApi<CampusPublic>(`/campuses/${campusSlug}`),
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      fullName: '',
      cpf: '',
      email: '',
      phone: '',
      courseId: '',
      lgpdConsent: false,
    },
  });

  async function onSubmit(values: FormValues) {
    try {
      const cpf = unmaskDigits(values.cpf);
      const parsedCpf = cpfSchema.safeParse(cpf);
      if (!parsedCpf.success) {
        form.setError('cpf', { message: 'CPF inválido' });
        return;
      }
      if (!campusQuery.data) return;

      const phone = phoneToE164(values.phone);
      const result = await publicApi<{ sessionId: string; portalToken: string; candidateId: string }>('/candidates', {
        method: 'POST',
        body: JSON.stringify({
          fullName: values.fullName,
          cpf,
          email: values.email,
          phone,
          courseId: values.courseId,
          campusId: campusQuery.data.id,
          source: 'chatbot_web',
          lgpdConsent: true,
        }),
      });

      onRegistered({
        ...result,
        campusId: campusQuery.data.id,
      });
    } catch (err) {
      form.setError('root', { message: err instanceof Error ? err.message : 'Falha no cadastro' });
    }
  }

  if (campusQuery.isLoading) return <Spinner label="Carregando campus…" />;
  if (campusQuery.isError || !campusQuery.data) {
    return <p className="text-rose-600">Campus não encontrado. Confira o link (ex.: /visita/sao-caetano).</p>;
  }

  const campus = campusQuery.data;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold text-brand-700">{campus.tenants?.name ?? 'Instituição'}</p>
        <h2 className="mt-1 text-2xl font-bold text-slate-900">Agende sua visita</h2>
        <p className="mt-1 text-sm text-slate-600">
          {campus.name}
          {campus.address ? ` · ${campus.address}` : ''}
        </p>
      </div>

      <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
        <div>
          <Label htmlFor="fullName">Nome completo</Label>
          <Input id="fullName" {...form.register('fullName')} />
          <FieldError>{form.formState.errors.fullName?.message}</FieldError>
        </div>
        <div>
          <Label htmlFor="cpf">CPF</Label>
          <Input
            id="cpf"
            inputMode="numeric"
            value={form.watch('cpf')}
            onChange={(e) => form.setValue('cpf', maskCpf(e.target.value), { shouldValidate: true })}
          />
          <FieldError>{form.formState.errors.cpf?.message}</FieldError>
        </div>
        <div>
          <Label htmlFor="email">E-mail</Label>
          <Input id="email" type="email" {...form.register('email')} />
          <FieldError>{form.formState.errors.email?.message}</FieldError>
        </div>
        <div>
          <Label htmlFor="phone">Telefone / WhatsApp</Label>
          <Input
            id="phone"
            inputMode="tel"
            placeholder="(11) 98765-4321"
            value={form.watch('phone')}
            onChange={(e) => form.setValue('phone', maskPhoneBr(e.target.value), { shouldValidate: true })}
          />
          <FieldError>{form.formState.errors.phone?.message}</FieldError>
        </div>
        <div>
          <Label htmlFor="courseId">Curso de interesse</Label>
          <Select id="courseId" {...form.register('courseId')}>
            <option value="">Selecione…</option>
            {campus.courses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.name}
              </option>
            ))}
          </Select>
          <FieldError>{form.formState.errors.courseId?.message}</FieldError>
        </div>
        <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700">
          <input type="checkbox" className="mt-1" {...form.register('lgpdConsent')} />
          <span>Li e aceito o tratamento dos meus dados para agendamento da visita (LGPD).</span>
        </label>
        <FieldError>{form.formState.errors.lgpdConsent?.message}</FieldError>
        <FieldError>{form.formState.errors.root?.message}</FieldError>
        <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? 'Enviando…' : 'Continuar para o questionário'}
        </Button>
      </form>
    </div>
  );
}
