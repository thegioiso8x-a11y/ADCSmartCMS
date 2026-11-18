'use client';

import React, { useState } from 'react';
import axios from 'axios';
import { PUBLIC_SITE_ID } from '@/lib/publicApi';

/**
 * PublicForm
 * ----------
 * Form thu thập khách hàng trên Public Website.
 * Submit -> POST /api/forms/{formCode}/submit?siteId=... (dùng axios).
 *
 * Props:
 *  - formCode: mã form (khớp data-cms-form trong HTML, VD 'contact_form').
 *  - fields: danh sách trường (name, label, type, required).
 *  - successMessage: thông báo khi gửi thành công.
 */
export interface PublicFormField {
  name: string;
  label: string;
  type?: 'text' | 'email' | 'tel' | 'textarea';
  required?: boolean;
}

export interface PublicFormProps {
  formCode: string;
  fields: PublicFormField[];
  successMessage?: string;
}

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5088').replace(/\/+$/, '');

export default function PublicForm({ formCode, fields, successMessage }: PublicFormProps) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleChange = (name: string, value: string) => {
    setValues((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setStatus(null);

    // Validate required phía client.
    for (const f of fields) {
      if (f.required && !values[f.name]?.trim()) {
        setStatus({ type: 'error', text: `Vui lòng nhập ${f.label}.` });
        return;
      }
    }

    setSubmitting(true);
    try {
      await axios.post(
        `${API_BASE}/api/forms/${encodeURIComponent(formCode)}/submit`,
        values,
        { params: { siteId: PUBLIC_SITE_ID }, headers: { 'Content-Type': 'application/json' } }
      );
      setStatus({
        type: 'success',
        text: successMessage || 'Cảm ơn bạn đã gửi thông tin!',
      });
      setValues({});
    } catch (err: unknown) {
      const e2 = err as { response?: { data?: { error?: string } } };
      setStatus({
        type: 'error',
        text: e2?.response?.data?.error || 'Gửi thông tin thất bại. Vui lòng thử lại.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3 max-w-lg">
      {fields.map((f) => (
        <div key={f.name}>
          <label htmlFor={`pf-${f.name}`} className="block text-sm font-medium text-slate-700 mb-1">
            {f.label}
            {f.required ? <span className="text-red-500"> *</span> : null}
          </label>
          {f.type === 'textarea' ? (
            <textarea
              id={`pf-${f.name}`}
              name={f.name}
              rows={4}
              required={f.required}
              value={values[f.name] ?? ''}
              onChange={(e) => handleChange(f.name, e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          ) : (
            <input
              id={`pf-${f.name}`}
              name={f.name}
              type={f.type ?? 'text'}
              required={f.required}
              value={values[f.name] ?? ''}
              onChange={(e) => handleChange(f.name, e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          )}
        </div>
      ))}

      <button
        type="submit"
        disabled={submitting}
        className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
      >
        {submitting ? 'Đang gửi...' : 'Gửi thông tin'}
      </button>

      {status ? (
        <div
          className={`rounded-lg px-3 py-2 text-sm ${
            status.type === 'success'
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              : 'bg-red-50 text-red-700 border border-red-200'
          }`}
        >
          {status.text}
        </div>
      ) : null}
    </form>
  );
}
