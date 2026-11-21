'use client';

import React, { useCallback, useEffect, useState } from 'react';
import TemplateViewer from './components/TemplateViewer';
import {
  Steps, Card, Upload, Button, Space, Typography, Alert, Form, Input, Tag, Result, App, Divider,
  List, Empty, Spin, Tabs, Table, ColorPicker, Select, Row, Col, Popconfirm,
} from 'antd';
import type { UploadFile, TabsProps } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  InboxOutlined, CheckCircleOutlined, CloseCircleOutlined, WarningOutlined,
  ThunderboltOutlined, CloudUploadOutlined, ReloadOutlined, LayoutOutlined,
  BgColorsOutlined, SaveOutlined, EditOutlined, DeleteOutlined,
} from '@ant-design/icons';
import api from '@/lib/api';
import { useAuthStore } from '@/store/useAuthStore';

const { Title, Text, Paragraph } = Typography;
const { Dragger } = Upload;

// ============================================================================
// Types (khớp DTO backend .NET)
// ============================================================================

/** POST /api/debug/lint-theme -> ThemeLintReport */
interface ThemeLintIssue {
  code: string;
  severity: 'Warning' | 'Error';
  file?: string | null;
  line?: number | null;
  message: string;
}

interface ThemeLintStats {
  totalFiles: number;
  htmlFiles: number;
  cssFiles: number;
  jsFiles: number;
  otherFiles: number;
}

interface ThemeLintReport {
  isValid: boolean;
  errorCount: number;
  warningCount: number;
  stats: ThemeLintStats;
  issues: ThemeLintIssue[];
  rootFolder?: string;
}

/** POST /api/debug/import-theme -> 201 Created */
interface ThemeImportResponse {
  status: string;
  themeId: string;
  templateId: string;
  themeCode: string;
  templateKey: string;
  templateType: string;
  rootFolder?: string;
  warningCount: number;
  warnings: ThemeLintIssue[];
  parsed: unknown;
}

/** POST /api/debug/generate-schema/{themeId} */
interface GenerateSchemaResponse {
  status: string;
  themeId: string;
  templatesRead: number;
  contentTypes: unknown[];
  warnings: string[];
  persisted: unknown;
}

interface ImportFormValues {
  themeCode: string;
  themeName: string;
  version: string;
  assetsBaseUrl: string;
}

/** GET /api/themes -> ThemeListItemDto */
interface ThemeListItem {
  id: string;
  themeCode: string;
  themeName: string;
  version: string;
  assetsBaseUrl: string;
  thumbnailUrl?: string | null;
  themeVariables: string;
  createdAt: string;
  isActive: boolean;
}

interface ThemeVariablesFormValues {
  primary_color: string;
  font_family: string;
}

const FONT_FAMILY_OPTIONS = [
  { label: 'Inter', value: 'Inter' },
  { label: 'Roboto', value: 'Roboto' },
  { label: 'Open Sans', value: 'Open Sans' },
  { label: 'Be Vietnam Pro', value: 'Be Vietnam Pro' },
  { label: 'Montserrat', value: 'Montserrat' },
  { label: 'Poppins', value: 'Poppins' },
  { label: 'system-ui', value: 'system-ui' },
];

// ============================================================================
// Helpers (type guard — không dùng any)
// ============================================================================

/** Chuẩn hóa response lint về ThemeLintReport an toàn. */
function toLintReport(data: unknown): ThemeLintReport | null {
  if (!data || typeof data !== 'object') return null;
  const obj = data as Record<string, unknown>;

  const issuesRaw = obj.issues;
  const issues: ThemeLintIssue[] = Array.isArray(issuesRaw)
    ? issuesRaw
        .filter((i): i is Record<string, unknown> => Boolean(i) && typeof i === 'object')
        .map((i) => ({
          code: typeof i.code === 'string' ? i.code : '',
          severity: i.severity === 'Error' ? 'Error' : 'Warning',
          file: typeof i.file === 'string' ? i.file : null,
          line: typeof i.line === 'number' ? i.line : null,
          message: typeof i.message === 'string' ? i.message : '',
        }))
    : [];

  const statsRaw = obj.stats;
  const stats: ThemeLintStats =
    statsRaw && typeof statsRaw === 'object'
      ? {
          totalFiles: Number((statsRaw as Record<string, unknown>).totalFiles ?? 0),
          htmlFiles: Number((statsRaw as Record<string, unknown>).htmlFiles ?? 0),
          cssFiles: Number((statsRaw as Record<string, unknown>).cssFiles ?? 0),
          jsFiles: Number((statsRaw as Record<string, unknown>).jsFiles ?? 0),
          otherFiles: Number((statsRaw as Record<string, unknown>).otherFiles ?? 0),
        }
      : { totalFiles: 0, htmlFiles: 0, cssFiles: 0, jsFiles: 0, otherFiles: 0 };

  return {
    isValid: obj.isValid === true,
    errorCount: Number(obj.errorCount ?? 0),
    warningCount: Number(obj.warningCount ?? 0),
    stats,
    issues,
    rootFolder: typeof obj.rootFolder === 'string' ? obj.rootFolder : '',
  };
}

/** Lấy thông báo lỗi từ axios error an toàn. */
function getErrorMessage(err: unknown, fallback: string): string {
  const e = err as { response?: { data?: { error?: string } } };
  return e?.response?.data?.error || fallback;
}

/** Parse an toàn chuỗi JSON object -> Record. */
function parseVariables(raw?: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/** Chuẩn hóa response danh sách theme về ThemeListItem[] an toàn. */
function toThemeArray(data: unknown): ThemeListItem[] {
  if (Array.isArray(data)) return data as ThemeListItem[];
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    for (const key of ['items', 'themes', 'data', 'result']) {
      const v = obj[key];
      if (Array.isArray(v)) return v as ThemeListItem[];
    }
  }
  return [];
}

// ============================================================================
// Component
// ============================================================================

export default function ThemesPage() {
  const { message } = App.useApp();
  const siteId = useAuthStore((state) => state.siteId);

  const [current, setCurrent] = useState(0);

  // ----- Bước 1: Lint -----
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [linting, setLinting] = useState(false);
  const [lintReport, setLintReport] = useState<ThemeLintReport | null>(null);

  // ----- Bước 2: Import -----
  const [importForm] = Form.useForm<ImportFormValues>();
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ThemeImportResponse | null>(null);

  // ----- Bước 3: Generate Schema -----
  const [generating, setGenerating] = useState(false);
  const [schemaResult, setSchemaResult] = useState<GenerateSchemaResponse | null>(null);

  // ----- Tab Quản lý Giao diện (Theme Customizer) -----
  const [activeTab, setActiveTab] = useState('import');
  const [themes, setThemes] = useState<ThemeListItem[]>([]);
  const [themesLoading, setThemesLoading] = useState(false);
  const [selectedTheme, setSelectedTheme] = useState<ThemeListItem | null>(null);
  const [savingVariables, setSavingVariables] = useState(false);
  const [variablesForm] = Form.useForm<ThemeVariablesFormValues>();

  /** Tải danh sách theme (GET /api/themes?siteId=...). */
  const loadThemes = useCallback(async () => {
    setThemesLoading(true);
    try {
      const res = await api.get<unknown>('/api/themes', { params: { siteId } });
      setThemes(toThemeArray(res.data));
    } catch (err: unknown) {
      message.error(getErrorMessage(err, 'Không tải được danh sách theme'));
      setThemes([]);
    } finally {
      setThemesLoading(false);
    }
  }, [message, siteId]);

  useEffect(() => {
    loadThemes();
  }, [loadThemes]);

  /** Chọn theme -> parse theme_variables vào form. */
  const handleSelectTheme = (record: ThemeListItem) => {
    setSelectedTheme(record);
    const vars = parseVariables(record.themeVariables);
    variablesForm.setFieldsValue({
      primary_color: typeof vars.primary_color === 'string' ? vars.primary_color : '#2563eb',
      font_family: typeof vars.font_family === 'string' ? vars.font_family : 'Inter',
    });
  };

  /** Lưu theme_variables (PUT /api/themes/{id}/variables). */
  const handleSaveVariables = async () => {
    if (!selectedTheme) return;

    let values: ThemeVariablesFormValues;
    try {
      values = await variablesForm.validateFields();
    } catch {
      return;
    }

    setSavingVariables(true);
    try {
      // Giữ nguyên các biến khác đã có, chỉ ghi đè 2 biến được chỉnh.
      const existing = parseVariables(selectedTheme.themeVariables);
      const merged: Record<string, unknown> = {
        ...existing,
        primary_color: values.primary_color,
        font_family: values.font_family,
      };

      const res = await api.put<ThemeListItem>(`/api/themes/${selectedTheme.id}/variables`, {
        themeVariables: merged,
      });

      message.success('Lưu biến giao diện thành công');
      setSelectedTheme(res.data);
      await loadThemes();
    } catch (err: unknown) {
      message.error(getErrorMessage(err, 'Lưu biến giao diện thất bại'));
    } finally {
      setSavingVariables(false);
    }
  };

  /** Xóa theme (DELETE /api/themes/{id}). Chặn nếu theme đang active (409). */
  const handleDeleteTheme = async (record: ThemeListItem) => {
    try {
      await api.delete(`/api/themes/${record.id}`);
      message.success(`Đã xóa theme "${record.themeName}"`);
      // Nếu đang chọn theme bị xóa -> bỏ chọn.
      if (selectedTheme?.id === record.id) {
        setSelectedTheme(null);
        variablesForm.resetFields();
      }
      await loadThemes();
    } catch (err: unknown) {
      const e = err as { response?: { status?: number; data?: { error?: string } } };
      if (e?.response?.status === 409) {
        message.error(e?.response?.data?.error || 'Không thể xóa theme đang được site sử dụng.');
      } else {
        message.error(getErrorMessage(err, 'Xóa theme thất bại'));
      }
    }
  };

  /** Reset toàn bộ wizard về Bước 1. */
  const resetWizard = () => {
    setCurrent(0);
    setFileList([]);
    setSelectedFile(null);
    setLintReport(null);
    setImportResult(null);
    setSchemaResult(null);
    importForm.resetFields();
  };

  /** Bước 1: gọi POST /api/debug/lint-theme với FormData(file). */
  const handleLint = async (file: File) => {
    setLinting(true);
    setLintReport(null);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await api.post<unknown>('/api/debug/lint-theme', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const report = toLintReport(res.data);
      setLintReport(report);

      if (report && report.errorCount > 0) {
        message.error(`Gói theme có ${report.errorCount} lỗi. Vui lòng sửa trước khi import.`);
      } else if (report) {
        message.success(
          `Lint thành công: ${report.stats.totalFiles} file, ${report.warningCount} cảnh báo.`
        );
      }
    } catch (err: unknown) {
      message.error(getErrorMessage(err, 'Lint theme thất bại'));
      setLintReport(null);
    } finally {
      setLinting(false);
    }
  };

  /** Bước 2: gọi POST /api/debug/import-theme (FormData: file + các trường). */
  const handleImport = async () => {
    if (!selectedFile) {
      message.error('Chưa có file .zip. Vui lòng quay lại Bước 1.');
      return;
    }

    let values: ImportFormValues;
    try {
      values = await importForm.validateFields();
    } catch {
      return;
    }

    setImporting(true);
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('assetsBaseUrl', values.assetsBaseUrl.trim());
      formData.append('themeCode', values.themeCode.trim());
      formData.append('themeName', values.themeName.trim());
      formData.append('version', values.version.trim());

      const res = await api.post<ThemeImportResponse>('/api/debug/import-theme', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      setImportResult(res.data);
      message.success('Import theme thành công');
      setCurrent(2);
    } catch (err: unknown) {
      const e = err as { response?: { status?: number; data?: { error?: string } } };
      if (e?.response?.status === 409) {
        message.error(e?.response?.data?.error || 'themeCode đã tồn tại. Vui lòng chọn mã khác.');
      } else {
        message.error(getErrorMessage(err, 'Import theme thất bại'));
      }
    } finally {
      setImporting(false);
    }
  };

  /** Bước 3: gọi POST /api/debug/generate-schema/{themeId}. */
  const handleGenerateSchema = async () => {
    if (!importResult?.themeId) {
      message.error('Chưa có themeId. Vui lòng import theme trước.');
      return;
    }

    setGenerating(true);
    try {
      const res = await api.post<GenerateSchemaResponse>(
        `/api/debug/generate-schema/${importResult.themeId}`
      );
      setSchemaResult(res.data);
      message.success(
        `Đã sinh ${res.data.contentTypes?.length ?? 0} Content Type từ ${res.data.templatesRead} template.`
      );
    } catch (err: unknown) {
      message.error(getErrorMessage(err, 'Sinh cấu trúc dữ liệu thất bại'));
    } finally {
      setGenerating(false);
    }
  };

  const errorIssues = lintReport?.issues.filter((i) => i.severity === 'Error') ?? [];
  const warningIssues = lintReport?.issues.filter((i) => i.severity === 'Warning') ?? [];

  // ==========================================================================
  // Render từng bước
  // ==========================================================================

  /** Bước 1: Upload + Lint. */
  const renderStep1 = () => (
    <div className="space-y-4">
      <Dragger
        accept=".zip"
        maxCount={1}
        fileList={fileList}
        beforeUpload={(file) => {
          // Chặn upload tự động của AntD — tự gọi API lint.
          setSelectedFile(file);
          setFileList([
            {
              uid: file.uid,
              name: file.name,
              status: 'done',
              size: file.size,
              type: file.type,
            },
          ]);
          setLintReport(null);
          void handleLint(file);
          return false;
        }}
        onRemove={() => {
          setSelectedFile(null);
          setFileList([]);
          setLintReport(null);
        }}
        disabled={linting}
        className="rounded-xl"
      >
        <p className="ant-upload-drag-icon">
          <InboxOutlined className="text-indigo-500" />
        </p>
        <p className="ant-upload-text">Nhấn hoặc kéo thả file .zip vào đây</p>
        <p className="ant-upload-hint">
          Gói theme chứa index.html, các file .css/.js và thư mục /images.
        </p>
      </Dragger>

      {linting ? (
        <div className="flex items-center gap-2 text-slate-600">
          <Spin size="small" /> Đang kiểm tra gói theme...
        </div>
      ) : null}

      {lintReport ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Tag color={lintReport.errorCount > 0 ? 'red' : 'green'} className="rounded-md font-semibold">
              {lintReport.errorCount} lỗi
            </Tag>
            <Tag color={lintReport.warningCount > 0 ? 'orange' : 'default'} className="rounded-md font-semibold">
              {lintReport.warningCount} cảnh báo
            </Tag>
            <Tag className="rounded-md">
              {lintReport.stats.totalFiles} file ({lintReport.stats.htmlFiles} html,{' '}
              {lintReport.stats.cssFiles} css, {lintReport.stats.jsFiles} js)
            </Tag>
            {lintReport.rootFolder ? (
              <Tag color="blue" className="rounded-md">
                root: {lintReport.rootFolder}
              </Tag>
            ) : null}
          </div>

          {errorIssues.length > 0 ? (
            <Alert
              type="error"
              showIcon
              message={`Phát hiện ${errorIssues.length} lỗi — gói theme không hợp lệ`}
              description={
                <List
                  size="small"
                  dataSource={errorIssues}
                  renderItem={(item) => (
                    <List.Item className="!px-0">
                      <Space align="start" size={8}>
                        <CloseCircleOutlined className="text-red-500 mt-1" />
                        <div>
                          <Text strong className="text-xs font-mono">{item.code}</Text>
                          {item.file ? (
                            <Text type="secondary" className="text-xs">
                              {' '}
                              — {item.file}
                              {item.line ? `:${item.line}` : ''}
                            </Text>
                          ) : null}
                          <div className="text-sm text-slate-700">{item.message}</div>
                        </div>
                      </Space>
                    </List.Item>
                  )}
                />
              }
              className="rounded-xl"
            />
          ) : null}

          {warningIssues.length > 0 ? (
            <Alert
              type="warning"
              showIcon
              message={`${warningIssues.length} cảnh báo (không chặn import)`}
              description={
                <List
                  size="small"
                  dataSource={warningIssues}
                  renderItem={(item) => (
                    <List.Item className="!px-0">
                      <Space align="start" size={8}>
                        <WarningOutlined className="text-amber-500 mt-1" />
                        <div>
                          <Text strong className="text-xs font-mono">{item.code}</Text>
                          {item.file ? (
                            <Text type="secondary" className="text-xs">
                              {' '}
                              — {item.file}
                              {item.line ? `:${item.line}` : ''}
                            </Text>
                          ) : null}
                          <div className="text-sm text-slate-700">{item.message}</div>
                        </div>
                      </Space>
                    </List.Item>
                  )}
                />
              }
              className="rounded-xl"
            />
          ) : null}

          {lintReport.errorCount === 0 ? (
            <Alert
              type="success"
              showIcon
              message="Gói theme hợp lệ, sẵn sàng import."
              className="rounded-xl"
            />
          ) : null}
        </div>
      ) : null}

      <div className="flex justify-end">
        <Button
          type="primary"
          onClick={() => setCurrent(1)}
          disabled={!lintReport || lintReport.errorCount > 0}
          className="rounded-lg font-semibold shadow-sm shadow-indigo-200"
        >
          Tiếp tục
        </Button>
      </div>
    </div>
  );

  /** Bước 2: Form import. */
  const renderStep2 = () => (
    <div className="space-y-4">
      <Alert
        type="info"
        showIcon
        message="Thông tin theme sẽ được lưu vào bảng cms_themes + cms_theme_templates."
        className="rounded-xl"
      />

      <Form
        form={importForm}
        layout="vertical"
        requiredMark="optional"
        initialValues={{ version: '1.0.0' }}
      >
        <div className="grid grid-cols-2 gap-x-4">
          <Form.Item
            name="themeCode"
            label="Mã theme (themeCode)"
            rules={[
              { required: true, message: 'Vui lòng nhập themeCode' },
              {
                pattern: /^[a-z][a-z0-9_]{0,99}$/,
                message: 'snake_case: bắt đầu bằng chữ thường, chỉ a-z, 0-9, _',
              },
            ]}
            extra="VD: tech_store_theme"
          >
            <Input placeholder="tech_store_theme" className="rounded-lg font-mono" />
          </Form.Item>
          <Form.Item
            name="themeName"
            label="Tên theme (themeName)"
            rules={[{ required: true, message: 'Vui lòng nhập themeName' }]}
          >
            <Input placeholder="Tech Store Theme" className="rounded-lg" />
          </Form.Item>

          <Form.Item
            name="version"
            label="Phiên bản (version)"
            rules={[{ required: true, message: 'Vui lòng nhập version' }]}
          >
            <Input placeholder="1.0.0" className="rounded-lg font-mono" />
          </Form.Item>
          <Form.Item
            name="assetsBaseUrl"
            label="URL gốc tài nguyên (assetsBaseUrl)"
            rules={[{ required: true, message: 'Vui lòng nhập assetsBaseUrl' }]}
            extra="VD: https://cdn.example.com/themes/tech_store"
          >
            <Input placeholder="https://cdn.example.com/themes/tech_store" className="rounded-lg font-mono" />
          </Form.Item>
        </div>
      </Form>

      <div className="flex justify-between">
        <Button onClick={() => setCurrent(0)} className="rounded-lg">
          Quay lại
        </Button>
        <Button
          type="primary"
          icon={<CloudUploadOutlined />}
          onClick={handleImport}
          loading={importing}
          className="rounded-lg font-semibold shadow-sm shadow-indigo-200"
        >
          Import
        </Button>
      </div>
    </div>
  );

  /** Bước 3: Generate schema. */
  const renderStep3 = () => (
    <div className="space-y-4">
      <Result
        status="success"
        icon={<CheckCircleOutlined className="text-emerald-500" />}
        title="Theme đã được import thành công"
        subTitle={
          importResult ? (
            <Space direction="vertical" size={2} className="text-sm">
              <span>
                <Text type="secondary">themeCode: </Text>
                <Text code>{importResult.themeCode}</Text>
              </span>
              <span>
                <Text type="secondary">themeId: </Text>
                <Text code className="text-xs">{importResult.themeId}</Text>
              </span>
              <span>
                <Text type="secondary">templateId: </Text>
                <Text code className="text-xs">{importResult.templateId}</Text>
              </span>
              <span>
                <Text type="secondary">Cảnh báo: </Text>
                <Tag color={importResult.warningCount > 0 ? 'orange' : 'default'} className="rounded-md">
                  {importResult.warningCount}
                </Tag>
              </span>
            </Space>
          ) : null
        }
      />

      <Divider className="!my-2" />

      <div className="text-center">
        <Paragraph className="text-slate-600">
          Bước cuối: tự động đọc <Text code>extracted_schema</Text> của theme và sinh{' '}
          <Text code>cms_content_types</Text> + <Text code>cms_field_definitions</Text>.
        </Paragraph>
        <Button
          type="primary"
          size="large"
          icon={<ThunderboltOutlined />}
          onClick={handleGenerateSchema}
          loading={generating}
          className="rounded-lg font-semibold shadow-sm shadow-indigo-200"
        >
          Tự động sinh Cấu trúc dữ liệu
        </Button>
      </div>

      {schemaResult ? (
        <Alert
          type="success"
          showIcon
          message={`Đã sinh ${schemaResult.contentTypes?.length ?? 0} Content Type từ ${schemaResult.templatesRead} template`}
          description={
            <div className="space-y-1 text-sm">
              <div>
                <Text type="secondary">Trạng thái: </Text>
                <Tag color="green" className="rounded-md">{schemaResult.status}</Tag>
              </div>
              {Array.isArray(schemaResult.warnings) && schemaResult.warnings.length > 0 ? (
                <div>
                  <Text type="secondary">Cảnh báo: </Text>
                  <ul className="list-disc pl-5 mt-1">
                    {schemaResult.warnings.map((w, idx) => (
                      <li key={idx} className="text-slate-600">{w}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          }
          className="rounded-xl"
        />
      ) : null}

      <div className="flex justify-between">
        <Button icon={<ReloadOutlined />} onClick={resetWizard} className="rounded-lg">
          Quay lại Bước 1
        </Button>
      </div>
    </div>
  );

  const themeColumns: ColumnsType<ThemeListItem> = [
    {
      title: 'Mã theme',
      dataIndex: 'themeCode',
      key: 'themeCode',
      width: 200,
      render: (v: string) => <span className="font-mono text-sm font-semibold text-indigo-600">{v}</span>,
    },
    {
      title: 'Tên theme',
      dataIndex: 'themeName',
      key: 'themeName',
      render: (v: string) => <span className="font-semibold text-slate-800">{v}</span>,
    },
    {
      title: 'Trạng thái',
      dataIndex: 'isActive',
      key: 'isActive',
      width: 140,
      align: 'center',
      render: (v: boolean) =>
        v ? (
          <Tag color="green" className="rounded-md font-semibold">Đang sử dụng</Tag>
        ) : (
          <Tag color="default" className="rounded-md">Chưa dùng</Tag>
        ),
    },
    {
      title: 'Phiên bản',
      dataIndex: 'version',
      key: 'version',
      width: 110,
      align: 'center',
      render: (v: string) => <Tag className="rounded-md font-mono">{v}</Tag>,
    },
    {
      title: 'Ngày tạo',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 170,
      render: (v: string) => <span className="text-slate-600">{v ? new Date(v).toLocaleString('vi-VN') : '—'}</span>,
    },
    {
      title: 'Thao tác',
      key: 'action',
      width: 200,
      align: 'right',
      render: (_, record) => (
        <Space size="small">
          <Button
            type="link"
            icon={<EditOutlined />}
            className="font-medium"
            onClick={() => handleSelectTheme(record)}
          >
            Tùy chỉnh
          </Button>
          <Popconfirm
            title="Xóa theme này?"
            description="Hành động này không thể hoàn tác. Không thể xóa theme đang được site sử dụng."
            okText="Xóa"
            cancelText="Hủy"
            okButtonProps={{ danger: true }}
            onConfirm={() => handleDeleteTheme(record)}
          >
            <Button type="link" danger icon={<DeleteOutlined />} className="font-medium">
              Xóa
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  /** Tab "Quản lý Giao diện": danh sách theme + Theme Customizer. */
  const renderManageThemes = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Text className="text-slate-500">
          Chọn 1 theme để tùy chỉnh biến màu sắc / font chữ (lưu trong cột <Text code>theme_variables</Text>).
        </Text>
        <Button icon={<ReloadOutlined />} onClick={loadThemes} loading={themesLoading} className="rounded-lg">
          Tải lại
        </Button>
      </div>

      <Table<ThemeListItem>
        rowKey="id"
        columns={themeColumns}
        dataSource={Array.isArray(themes) ? themes : []}
        loading={themesLoading}
        pagination={{ pageSize: 10, showSizeChanger: false, showTotal: (t) => `Tổng ${t} theme` }}
        locale={{ emptyText: <Empty description="Chưa có theme nào. Hãy import theme ở tab bên cạnh." /> }}
        rowClassName={(record) =>
          selectedTheme?.id === record.id ? 'bg-indigo-50/60 cursor-pointer' : 'cursor-pointer'
        }
        onRow={(record) => ({ onClick: () => handleSelectTheme(record) })}
      />

      {selectedTheme ? (
        <Card
          className="rounded-2xl shadow-sm border-slate-200"
          title={
            <span className="font-bold flex items-center gap-2">
              <BgColorsOutlined className="text-indigo-600" />
              Theme Customizer — {selectedTheme.themeName}
              <Tag className="rounded-md font-mono ml-1">{selectedTheme.themeCode}</Tag>
            </span>
          }
        >
          <Form form={variablesForm} layout="vertical" requiredMark="optional">
            <Row gutter={24}>
              <Col xs={24} md={12}>
                <Form.Item
                  name="primary_color"
                  label="Màu chính (primary_color)"
                  rules={[{ required: true, message: 'Vui lòng chọn màu chính' }]}
                  getValueFromEvent={(color: unknown) => {
                    // ColorPicker trả về Color object -> lấy hex string.
                    if (typeof color === 'string') return color;
                    if (color && typeof color === 'object') {
                      const c = color as { toHexString?: () => string };
                      if (typeof c.toHexString === 'function') return c.toHexString();
                    }
                    return '#2563eb';
                  }}
                >
                  <ColorPicker showText format="hex" size="large" className="w-full" />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item
                  name="font_family"
                  label="Font chữ (font_family)"
                  rules={[{ required: true, message: 'Vui lòng chọn font chữ' }]}
                >
                  <Select options={FONT_FAMILY_OPTIONS} className="w-full" size="large" />
                </Form.Item>
              </Col>
            </Row>

            <Divider className="!my-2" />

            <div className="text-xs text-slate-500 mb-2">Biến hiện tại trong DB:</div>
            <pre className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs overflow-auto max-h-40 mb-4">
              {JSON.stringify(parseVariables(selectedTheme.themeVariables), null, 2)}
            </pre>

            <Space>
              <Button
                type="primary"
                icon={<SaveOutlined />}
                onClick={handleSaveVariables}
                loading={savingVariables}
                className="rounded-lg font-semibold shadow-sm shadow-indigo-200"
              >
                Lưu thay đổi
              </Button>
              <Button
                onClick={() => {
                  setSelectedTheme(null);
                  variablesForm.resetFields();
                }}
                className="rounded-lg"
              >
                Đóng
              </Button>
            </Space>
          </Form>
        </Card>
      ) : null}
    </div>
  );

  const tabItems: TabsProps['items'] = [
    {
      key: 'import',
      label: (
        <span className="flex items-center gap-2 font-medium">
          <CloudUploadOutlined />
          Import Theme
        </span>
      ),
      children: (
        <div className="space-y-4">
          <Steps
            current={current}
            onChange={(idx) => {
              // Chỉ cho phép quay lại bước trước, không nhảy cóc.
              if (idx < current) setCurrent(idx);
            }}
            items={[
              { title: 'Lint Theme', description: 'Kiểm tra gói .zip' },
              { title: 'Import Theme', description: 'Lưu vào DB' },
              { title: 'Generate Schema', description: 'Sinh Content Types' },
            ]}
            className="mb-8"
          />

          <Card className="rounded-xl border-slate-200" size="small">
            {current === 0 ? renderStep1() : null}
            {current === 1 ? renderStep2() : null}
            {current === 2 ? renderStep3() : null}
          </Card>
        </div>
      ),
    },
    {
      key: 'manage',
      label: (
        <span className="flex items-center gap-2 font-medium">
          <BgColorsOutlined />
          Quản lý Giao diện
        </span>
      ),
      children: renderManageThemes(),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Title level={3} className="!mb-1 !text-slate-800 flex items-center gap-2">
          <LayoutOutlined className="text-indigo-600" />
          Quản lý Giao diện (Theme)
        </Title>
        <Text className="text-slate-500">
          Import gói theme .zip và tùy chỉnh biến màu sắc / font chữ cho từng theme.
        </Text>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={tabItems}
          destroyOnHidden
          size="large"
        />
      </div>
    </div>
  );
}
