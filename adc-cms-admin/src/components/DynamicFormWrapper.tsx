'use client';

import React, { useMemo, useRef } from 'react';
import Form from '@rjsf/antd';
import type FormCore from '@rjsf/core';
import validator from '@rjsf/validator-ajv8';
import type { RJSFSchema, UiSchema, RegistryWidgetsType } from '@rjsf/utils';
import { Button, Input, InputNumber, Switch, Select, DatePicker } from 'antd';
import { PlusOutlined, SaveOutlined } from '@ant-design/icons';
import TiptapEditor from '@/components/TiptapEditor';

/**
 * DynamicFormWrapper
 * ------------------
 * Wrapper mỏng quanh RJSF (@rjsf/antd) để đồng bộ UI với theme ADC Smart CMS:
 *  - Input/Select/Number/Switch/DatePicker bo góc (rounded-lg), viền slate nhạt.
 *  - Nút Submit màu Indigo (#4f46e5), rounded-lg, shadow nhẹ.
 *  - Ẩn nút "Add"/"Remove" mặc định của RJSF để dùng nút tuỳ biến (nếu cần).
 *
 * Props:
 *  - schema: JSON Schema sinh từ danh sách FieldDefinition của Content Type.
 *  - formData: dữ liệu khởi tạo (controlled).
 *  - onSubmit: callback nhận (formData) khi người dùng bấm Submit.
 *  - submitting: hiển thị loading trên nút Submit.
 *  - submitLabel: nhãn nút Submit (mặc định "Lưu nội dung").
 */
export interface DynamicFormWrapperProps {
  schema: RJSFSchema;
  formData?: Record<string, unknown>;
  onSubmit: (data: Record<string, unknown>) => void | Promise<void>;
  submitting?: boolean;
  submitLabel?: string;
  onCancel?: () => void;
}

/** Class Tailwind dùng chung cho các control Ant Design bên trong RJSF. */
const CONTROL_CLASS = 'rounded-lg';

/** Class cho nút "Add" của trường mảng: viền nét đứt, gọn gàng. */
const ADD_BUTTON_CLASS =
  'w-full h-9 rounded-lg border border-dashed border-indigo-300 text-indigo-600 bg-indigo-50/40 hover:bg-indigo-50 hover:border-indigo-400 font-medium';

/** Widgets tuỳ biến: bọc control Ant Design với class Tailwind để đồng bộ giao diện. */
const widgets: RegistryWidgetsType = {
  TextWidget: (props) => (
    <Input
      className={CONTROL_CLASS}
      value={(props.value as string) ?? ''}
      placeholder={props.placeholder}
      disabled={props.disabled || props.readonly}
      onChange={(e) => props.onChange(e.target.value === '' ? undefined : e.target.value)}
    />
  ),
  TextareaWidget: (props) => (
    <Input.TextArea
      className={CONTROL_CLASS}
      rows={4}
      value={(props.value as string) ?? ''}
      placeholder={props.placeholder}
      disabled={props.disabled || props.readonly}
      onChange={(e) => props.onChange(e.target.value === '' ? undefined : e.target.value)}
    />
  ),
  NumberWidget: (props) => (
    <InputNumber
      className={`${CONTROL_CLASS} w-full`}
      value={props.value as number | undefined}
      placeholder={props.placeholder}
      disabled={props.disabled || props.readonly}
      onChange={(v) => props.onChange(v ?? undefined)}
    />
  ),
  CheckboxWidget: (props) => (
    <Switch
      checked={Boolean(props.value)}
      disabled={props.disabled || props.readonly}
      onChange={(checked) => props.onChange(checked)}
    />
  ),
  SelectWidget: (props) => {
    const options = (props.options?.enumOptions ?? []).map((o) => ({
      label: String(o.label),
      value: o.value as string | number,
    }));
    return (
      <Select
        className="w-full"
        value={props.value as string | number | undefined}
        placeholder={props.placeholder}
        disabled={props.disabled || props.readonly}
        options={options}
        onChange={(v) => props.onChange(v)}
        allowClear
      />
    );
  },
  DateWidget: (props) => (
    <DatePicker
      className={`${CONTROL_CLASS} w-full`}
      showTime
      disabled={props.disabled || props.readonly}
      onChange={(d) => props.onChange(d ? d.toISOString() : undefined)}
    />
  ),
  // Rich text editor (Tiptap) cho field có format 'rich_text'.
  RichTextWidget: (props) => (
    <TiptapEditor
      value={(props.value as string) ?? ''}
      onChange={(html) => props.onChange(html === '' ? undefined : html)}
      disabled={props.disabled || props.readonly}
      placeholder={props.placeholder}
    />
  ),
};

export default function DynamicFormWrapper({
  schema,
  formData,
  onSubmit,
  submitting = false,
  submitLabel = 'Lưu dữ liệu',
  onCancel,
}: DynamicFormWrapperProps) {
  // Ref tới instance Form core của RJSF để tự trigger submit từ nút Antd bên ngoài.
  const formRef = useRef<FormCore<Record<string, unknown>>>(null);

  // uiSchema: ẩn nút Submit mặc định của RJSF (ta tự render nút Antd) + nút Add cho từng field mảng.
  // RJSF KHÔNG cascade ui:addButtonOptions xuống field con, nên phải set riêng cho mỗi field mảng.
  const uiSchema: UiSchema = useMemo(() => {
    const base: UiSchema = {
      'ui:submitButtonOptions': { norender: true },
    };

    // Duyệt schema.properties:
    //  - field type 'array' -> gắn uiSchema riêng cho nút Add.
    //  - field format 'rich_text' -> dùng RichTextWidget (Tiptap).
    const props = (schema.properties ?? {}) as Record<string, { type?: string; format?: string }>;
    for (const [key, def] of Object.entries(props)) {
      if (def?.type === 'array') {
        base[key] = {
          'ui:options': { addable: true, orderable: false, removable: true },
          'ui:addButtonOptions': {
            props: { className: ADD_BUTTON_CLASS, icon: <PlusOutlined /> },
          },
        };
      } else if (def?.format === 'rich_text') {
        base[key] = { 'ui:widget': 'RichTextWidget' };
      }
    }
    return base;
  }, [schema]);

  /** Submit thủ công: gọi validate + submit của RJSF instance. */
  const handleSubmitClick = () => {
    formRef.current?.submit();
  };

  return (
    <div className="rjsf-adc-wrapper">
      <Form
        ref={formRef}
        schema={schema}
        uiSchema={uiSchema}
        formData={formData}
        validator={validator}
        widgets={widgets}
        showErrorList={false}
        liveValidate={false}
        onSubmit={(e) => onSubmit((e.formData ?? {}) as Record<string, unknown>)}
      >
        {/* Footer: nút Hủy + Lưu cùng hàng, căn phải. */}
        <div className="mt-6 flex items-center justify-end gap-3">
          {onCancel ? (
            <Button onClick={onCancel} className="rounded-lg h-10 px-5">
              Hủy
            </Button>
        ) : null}
          <Button
            type="primary"
            icon={<SaveOutlined />}
            loading={submitting}
            onClick={handleSubmitClick}
            className="rounded-lg h-10 px-6 font-semibold shadow-sm shadow-indigo-200"
          >
            {submitLabel}
          </Button>
        </div>
      </Form>
    </div>
  );
}
