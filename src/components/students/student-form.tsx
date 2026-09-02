'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { SelectInput, TextInput } from '@/components/ui/field';
import { Alert } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import type { Student } from '@/lib/types/database';
import { createStudent, updateStudent } from '@/server/actions/students';

interface StudentFormProps {
  classes: { id: string; name: string; sectionName: string }[];
  termId: string | null;
  /** Provide to edit an existing student; omit to register a new one. */
  student?: Student;
  defaultClassId?: string;
}

const GENDER_OPTIONS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
];

/** Single-student registration and edit form. */
export function StudentForm({ classes, termId, student, defaultClassId }: StudentFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  const editing = Boolean(student);

  function onSubmit(formData: FormData) {
    setError(null);
    setFieldErrors({});
    if (termId) formData.set('termId', termId);

    startTransition(async () => {
      const result = editing
        ? await updateStudent(formData)
        : await createStudent(formData);

      if (!result.ok) {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }

      toast(editing ? 'Student updated' : 'Student registered', 'success');
      router.push('/students');
      router.refresh();
    });
  }

  return (
    <form action={onSubmit} className="space-y-5">
      {error && <Alert>{error}</Alert>}
      {student && <input type="hidden" name="studentId" value={student.id} />}

      <div className="grid gap-4 sm:grid-cols-2">
        <TextInput
          label="Admission number"
          name="admissionNumber"
          required={!editing}
          disabled={editing}
          defaultValue={student?.admission_number}
          placeholder="BFS/2026/001"
          error={fieldErrors.admissionNumber}
          hint={editing ? 'Admission numbers cannot be changed' : undefined}
        />
        <SelectInput
          label="Class"
          name="classId"
          required
          defaultValue={student?.class_id ?? defaultClassId ?? ''}
          placeholder="Select a class"
          options={classes.map((item) => ({
            value: item.id,
            label: `${item.name} · ${item.sectionName}`,
          }))}
          error={fieldErrors.classId}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <TextInput
          label="First name"
          name="firstName"
          required
          defaultValue={student?.first_name}
          error={fieldErrors.firstName}
        />
        <TextInput
          label="Last name"
          name="lastName"
          required
          defaultValue={student?.last_name}
          error={fieldErrors.lastName}
        />
        <TextInput
          label="Middle name"
          name="middleName"
          defaultValue={student?.middle_name ?? ''}
          error={fieldErrors.middleName}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <SelectInput
          label="Gender"
          name="gender"
          defaultValue={student?.gender ?? ''}
          placeholder="Not specified"
          options={GENDER_OPTIONS}
          error={fieldErrors.gender}
        />
        <TextInput
          label="Date of birth"
          name="dateOfBirth"
          type="date"
          defaultValue={student?.date_of_birth ?? ''}
          error={fieldErrors.dateOfBirth}
        />
      </div>

      <fieldset className="space-y-4 rounded-lg border border-slate-200 p-4">
        <legend className="px-1 text-sm font-medium text-slate-700">Guardian</legend>
        <div className="grid gap-4 sm:grid-cols-3">
          <TextInput
            label="Full name"
            name="guardianName"
            defaultValue={student?.guardian_name ?? ''}
            error={fieldErrors.guardianName}
          />
          <TextInput
            label="Phone"
            name="guardianPhone"
            type="tel"
            defaultValue={student?.guardian_phone ?? ''}
            placeholder="08031234567"
            error={fieldErrors.guardianPhone}
          />
          <TextInput
            label="Email"
            name="guardianEmail"
            type="email"
            defaultValue={student?.guardian_email ?? ''}
            error={fieldErrors.guardianEmail}
          />
        </div>
      </fieldset>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => router.back()} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" loading={pending}>
          {editing ? 'Save changes' : 'Register student'}
        </Button>
      </div>
    </form>
  );
}
