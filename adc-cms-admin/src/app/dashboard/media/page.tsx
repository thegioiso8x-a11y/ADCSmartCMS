'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Card, Tree, Button, Input, Typography, message, Empty, Space, Modal, Form, Upload, Image, Tooltip, Popconfirm, Drawer,
} from 'antd';
import type { DataNode } from 'antd/es/tree';
import type { UploadProps } from 'antd';
import {
  FolderOutlined, FolderOpenOutlined, PlusOutlined, SearchOutlined, UploadOutlined,
  EditOutlined, CopyOutlined, DeleteOutlined, ReloadOutlined, FileImageOutlined,
} from '@ant-design/icons';
import api from '@/lib/api';
import { useAuthStore } from '@/store/useAuthStore';
import type { MediaFolder, MediaAsset } from '@/lib/types';

const { Title, Text } = Typography;

/** Base URL backend để ghép với originalUrl (đường dẫn tương đối /uploads/...). */
const API_BASE = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5088').replace(/\/+$/, '');

/** Ghép URL đầy đủ cho file media (thêm Base URL backend nếu là đường dẫn tương đối). */
function fullUrl(url: string): string {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return `${API_BASE}${url.startsWith('/') ? '' : '/'}${url}`;
}

/** Định dạng dung lượng file. */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Kiểm tra file có phải ảnh không (để hiển thị preview). */
function isImage(mime: string): boolean {
  return mime.startsWith('image/');
}

interface CreateFolderFormValues {
  folderName: string;
}

interface EditAssetFormValues {
  fileName: string;
  altTextVi: string;
}

/** Parse an toàn chuỗi JSON object -> Record (dùng để đọc alt_text_locales). */
function parseJsonObject(raw?: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export default function MediaPage() {
  const siteId = useAuthStore((state) => state.siteId);

  // ----- Thư mục -----
  const [folders, setFolders] = useState<MediaFolder[]>([]);
  const [foldersLoading, setFoldersLoading] = useState(false);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);

  // ----- Assets -----
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [keyword, setKeyword] = useState('');

  // ----- Modal thêm thư mục -----
  const [folderModalOpen, setFolderModalOpen] = useState(false);
  const [folderSubmitting, setFolderSubmitting] = useState(false);
  const [folderForm] = Form.useForm<CreateFolderFormValues>();

  // ----- Drawer sửa file -----
  const [editingAsset, setEditingAsset] = useState<MediaAsset | null>(null);
  const [editDrawerOpen, setEditDrawerOpen] = useState(false);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editForm] = Form.useForm<EditAssetFormValues>();

  /** Tải danh sách thư mục. */
  const loadFolders = useCallback(async () => {
    if (!siteId || siteId.trim() === '') return;
    setFoldersLoading(true);
    try {
      const res = await api.get<MediaFolder[]>('/api/media/folders', { params: { siteId } });
      setFolders(res.data ?? []);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      message.error(e?.response?.data?.error || 'Không tải được danh sách thư mục');
    } finally {
      setFoldersLoading(false);
    }
  }, [siteId]);

  /** Tải danh sách file theo thư mục đang chọn. */
  const loadAssets = useCallback(async () => {
    if (!siteId || siteId.trim() === '') return;
    setAssetsLoading(true);
    try {
      const res = await api.get<MediaAsset[]>('/api/media/assets', {
        params: { siteId, folderId: selectedFolderId ?? undefined },
      });
      setAssets(res.data ?? []);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      message.error(e?.response?.data?.error || 'Không tải được danh sách file');
      setAssets([]);
    } finally {
      setAssetsLoading(false);
    }
  }, [siteId, selectedFolderId]);

  // Chỉ gọi API khi đã có siteId (tránh gọi khi store chưa hydrate / siteId rỗng).
  useEffect(() => {
    if (!siteId || siteId.trim() === '') return;
    loadFolders();
  }, [siteId, loadFolders]);

  useEffect(() => {
    if (!siteId || siteId.trim() === '') return;
    loadAssets();
  }, [siteId, loadAssets]);

  /** Dựng cây thư mục cho Antd Tree từ danh sách phẳng. */
  const treeData = useMemo<DataNode[]>(() => {
    const byParent = new Map<string | null, MediaFolder[]>();
    for (const f of folders) {
      const key = f.parentId ?? null;
      const arr = byParent.get(key) ?? [];
      arr.push(f);
      byParent.set(key, arr);
    }

    const build = (parentId: string | null): DataNode[] => {
      const children = byParent.get(parentId) ?? [];
      return children.map((f) => ({
        key: f.id,
        title: f.folderName,
        icon: <FolderOutlined />,
        children: build(f.id),
      }));
    };

    return build(null);
  }, [folders]);

  /** Tên thư mục đang chọn (cho breadcrumb). */
  const selectedFolderName = useMemo(() => {
    if (!selectedFolderId) return '/';
    const f = folders.find((x) => x.id === selectedFolderId);
    return f ? f.folderPath : '/';
  }, [selectedFolderId, folders]);

  /** Lọc assets theo keyword (client-side). */
  const filteredAssets = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    if (!kw) return assets;
    return assets.filter((a) => a.fileName.toLowerCase().includes(kw));
  }, [assets, keyword]);

  /** Mở modal thêm thư mục. */
  const openCreateFolder = () => {
    folderForm.resetFields();
    setFolderModalOpen(true);
  };

  /** Submit tạo thư mục (parent = thư mục đang chọn). */
  const handleCreateFolder = async () => {
    if (!siteId) return;
    let values: CreateFolderFormValues;
    try {
      values = await folderForm.validateFields();
    } catch {
      return;
    }

    setFolderSubmitting(true);
    try {
      await api.post('/api/media/folders', {
        siteId,
        folderName: values.folderName.trim(),
        parentId: selectedFolderId,
      });
      message.success('Tạo thư mục thành công');
      setFolderModalOpen(false);
      await loadFolders();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      message.error(e?.response?.data?.error || 'Tạo thư mục thất bại');
    } finally {
      setFolderSubmitting(false);
    }
  };

  /** Cấu hình Upload của Antd: gọi POST /api/media/upload. */
  const uploadProps: UploadProps = {
    multiple: true,
    showUploadList: false,
    customRequest: async (options) => {
      const { file, onSuccess, onError } = options;
      if (!siteId || siteId.trim() === '') {
        message.error('Chưa xác định được site. Vui lòng đăng nhập lại.');
        onError?.(new Error('missing siteId'));
        return;
      }
      const formData = new FormData();
      formData.append('file', file as File);
      formData.append('siteId', siteId);
      if (selectedFolderId) formData.append('folderId', selectedFolderId);

      try {
        // Truyền siteId cả qua query param để backend đọc được ở mọi trường hợp.
        await api.post('/api/media/upload', formData, {
          params: { siteId, folderId: selectedFolderId ?? undefined },
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        onSuccess?.({});
        message.success(`Tải lên thành công: ${(file as File).name}`);
        await loadAssets();
      } catch (err: unknown) {
        const e = err as { response?: { data?: { error?: string } } };
        message.error(e?.response?.data?.error || `Tải lên thất bại: ${(file as File).name}`);
        onError?.(new Error('upload failed'));
      }
    },
  };

  /** Xóa asset. */
  const handleDeleteAsset = async (asset: MediaAsset) => {
    try {
      await api.delete(`/api/media/assets/${asset.id}`);
      message.success('Đã xóa file');
      await loadAssets();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      message.error(e?.response?.data?.error || 'Xóa file thất bại');
    }
  };

  /** Copy URL file vào clipboard. */
  const handleCopyUrl = async (asset: MediaAsset) => {
    try {
      await navigator.clipboard.writeText(fullUrl(asset.originalUrl));
      message.success('Đã copy URL file');
    } catch {
      message.error('Không copy được URL');
    }
  };

  /** Mở Drawer sửa file: nạp sẵn tên file + alt text tiếng Việt. */
  const openEditAsset = (asset: MediaAsset) => {
    setEditingAsset(asset);
    const alt = parseJsonObject(asset.altTextLocales);
    editForm.setFieldsValue({
      fileName: asset.fileName,
      altTextVi: typeof alt.vi === 'string' ? alt.vi : '',
    });
    setEditDrawerOpen(true);
  };

  /** Lưu thông tin file: gọi PUT /api/media/assets/{id}. */
  const handleSubmitEditAsset = async () => {
    if (!editingAsset) return;
    let values: EditAssetFormValues;
    try {
      values = await editForm.validateFields();
    } catch {
      return;
    }

    // Giữ nguyên các ngôn ngữ khác trong alt_text_locales, chỉ cập nhật 'vi'.
    const alt = parseJsonObject(editingAsset.altTextLocales);
    alt.vi = values.altTextVi.trim();

    setEditSubmitting(true);
    try {
      await api.put(`/api/media/assets/${editingAsset.id}`, {
        fileName: values.fileName.trim(),
        altTextLocales: JSON.stringify(alt),
      });
      message.success('Cập nhật file thành công');
      setEditDrawerOpen(false);
      setEditingAsset(null);
      await loadAssets();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      message.error(e?.response?.data?.error || 'Cập nhật file thất bại');
    } finally {
      setEditSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <Title level={3} className="!mb-1 !text-slate-800 flex items-center gap-2">
            <FolderOpenOutlined className="text-blue-600" />
            Kho Tệp Tin & Quản Lý Thư Mục
          </Title>
          <Text className="text-slate-500">
            Quản lý tập trung hình ảnh, video và tài liệu theo cây thư mục.
          </Text>
        </div>
        <Button icon={<ReloadOutlined />} onClick={() => { loadFolders(); loadAssets(); }} className="rounded-lg">
          Tải lại
        </Button>
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* Cột trái: Cây thư mục */}
        <div className="col-span-12 lg:col-span-3">
          <Card
            title={<span className="font-semibold text-slate-800">Cây Thư Mục</span>}
            className="rounded-2xl shadow-sm border border-slate-200"
            extra={
              <Tooltip title="Thêm thư mục">
                <Button type="text" icon={<PlusOutlined />} onClick={openCreateFolder} />
              </Tooltip>
            }
            loading={foldersLoading}
          >
            <div className="mb-2">
              <Button
                type={selectedFolderId === null ? 'primary' : 'text'}
                block
                icon={<FolderOpenOutlined />}
                className="justify-start rounded-lg"
                onClick={() => setSelectedFolderId(null)}
              >
                Tất cả file
              </Button>
            </div>
            {treeData.length === 0 ? (
              <Empty description="Chưa có thư mục" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            ) : (
              <Tree
                showIcon
                blockNode
                defaultExpandAll
                treeData={treeData}
                selectedKeys={selectedFolderId ? [selectedFolderId] : []}
                onSelect={(keys) => {
                  const key = keys[0];
                  setSelectedFolderId(typeof key === 'string' ? key : null);
                }}
              />
            )}
          </Card>
        </div>

        {/* Cột phải: Danh sách file */}
        <div className="col-span-12 lg:col-span-9">
          <Card className="rounded-2xl shadow-sm border border-slate-200">
            {/* Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <span>Đang chọn:</span>
                <span className="font-mono text-blue-600 font-semibold">{selectedFolderName}</span>
              </div>
              <Space wrap>
                <Input
                  placeholder="Tìm tên file..."
                  prefix={<SearchOutlined className="text-slate-400" />}
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  allowClear
                  style={{ width: 220 }}
                  className="rounded-lg"
                />
                <Upload {...uploadProps}>
                  <Button type="primary" icon={<UploadOutlined />} className="rounded-lg font-semibold">
                    Tải Tệp Vào Thư Mục Này
                  </Button>
                </Upload>
              </Space>
            </div>

            {/* Grid file */}
            {assetsLoading ? (
              <div className="text-slate-400 text-sm py-8 text-center">Đang tải file...</div>
            ) : filteredAssets.length === 0 ? (
              <Empty description="Chưa có file nào trong thư mục này" className="py-8" />
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {filteredAssets.map((asset) => (
                  <div
                    key={asset.id}
                    className="group rounded-xl border border-slate-200 overflow-hidden hover:border-blue-300 hover:shadow-md transition-all bg-white"
                  >
                    {/* Preview */}
                    <div className="h-32 bg-slate-50 flex items-center justify-center overflow-hidden">
                      {isImage(asset.mimeType) ? (
                        <Image
                          src={fullUrl(asset.thumbUrl || asset.originalUrl)}
                          alt={asset.fileName}
                          className="object-cover"
                          style={{ width: '100%', height: 128, objectFit: 'cover' }}
                          preview={{ src: fullUrl(asset.originalUrl) }}
                        />
                      ) : (
                        <FileImageOutlined className="text-4xl text-slate-300" />
                      )}
                    </div>

                    {/* Info + actions */}
                    <div className="p-2.5">
                      <div className="text-xs font-semibold text-slate-700 truncate" title={asset.fileName}>
                        {asset.fileName}
                      </div>
                      <div className="text-[11px] text-slate-400 mb-2">{formatSize(asset.fileSizeBytes)}</div>
                      <div className="flex items-center justify-between">
                        <Space size={2}>
                          <Tooltip title="Sửa">
                            <Button type="text" size="small" icon={<EditOutlined />} onClick={() => openEditAsset(asset)} />
                          </Tooltip>
                          <Tooltip title="Copy URL">
                            <Button type="text" size="small" icon={<CopyOutlined />} onClick={() => handleCopyUrl(asset)} />
                          </Tooltip>
                        </Space>
                        <Popconfirm
                          title="Xóa file này?"
                          okText="Xóa"
                          cancelText="Hủy"
                          okButtonProps={{ danger: true }}
                          onConfirm={() => handleDeleteAsset(asset)}
                        >
                          <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                        </Popconfirm>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Modal thêm thư mục */}
      <Modal
        title={<span className="font-semibold">Thêm thư mục mới</span>}
        open={folderModalOpen}
        onCancel={() => setFolderModalOpen(false)}
        onOk={handleCreateFolder}
        confirmLoading={folderSubmitting}
        okText="Tạo thư mục"
        cancelText="Hủy"
        destroyOnHidden
      >
        <Form form={folderForm} layout="vertical" requiredMark="optional" className="mt-4">
          <Form.Item
            name="folderName"
            label="Tên thư mục"
            rules={[{ required: true, message: 'Vui lòng nhập tên thư mục' }]}
            extra={selectedFolderId ? `Sẽ tạo bên trong: ${selectedFolderName}` : 'Sẽ tạo ở cấp gốc'}
          >
            <Input placeholder="san-pham" className="rounded-lg" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Drawer sửa file */}
      <Drawer
        title={<span className="font-semibold">Sửa thông tin file</span>}
        width={480}
        open={editDrawerOpen}
        onClose={() => {
          setEditDrawerOpen(false);
          setEditingAsset(null);
        }}
        destroyOnHidden
        footer={
          <div className="flex items-center justify-end gap-3">
            <Button
              onClick={() => {
                setEditDrawerOpen(false);
                setEditingAsset(null);
              }}
              className="rounded-lg h-10 px-5"
            >
              Hủy
            </Button>
            <Button
              type="primary"
              loading={editSubmitting}
              onClick={handleSubmitEditAsset}
              className="rounded-lg h-10 px-6 font-semibold shadow-sm shadow-blue-200"
            >
              Lưu
            </Button>
          </div>
        }
      >
        {editingAsset ? (
          <div className="mb-4">
            <div className="h-40 bg-slate-50 rounded-xl flex items-center justify-center overflow-hidden border border-slate-200">
              {isImage(editingAsset.mimeType) ? (
                <Image
                  src={fullUrl(editingAsset.thumbUrl || editingAsset.originalUrl)}
                  alt={editingAsset.fileName}
                  style={{ maxHeight: 160, objectFit: 'contain' }}
                  preview={{ src: fullUrl(editingAsset.originalUrl) }}
                />
              ) : (
                <FileImageOutlined className="text-5xl text-slate-300" />
              )}
            </div>
            <div className="mt-2 text-xs text-slate-400 font-mono break-all">{editingAsset.originalUrl}</div>
          </div>
        ) : null}

        <Form form={editForm} layout="vertical" requiredMark="optional">
          <Form.Item
            name="fileName"
            label="Tên file"
            rules={[{ required: true, message: 'Vui lòng nhập tên file' }]}
          >
            <Input placeholder="anh-san-pham.jpg" className="rounded-lg" />
          </Form.Item>
          <Form.Item name="altTextVi" label="Alt text (SEO - Tiếng Việt)">
            <Input.TextArea rows={3} placeholder="Mô tả nội dung hình ảnh..." className="rounded-lg" />
          </Form.Item>
        </Form>
      </Drawer>
    </div>
  );
}
