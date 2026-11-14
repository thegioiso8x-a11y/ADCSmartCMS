'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, Image, Empty, message, Input, Space, Tag } from 'antd';
import { SearchOutlined, FileImageOutlined, VideoCameraOutlined } from '@ant-design/icons';
import api from '@/lib/api';
import { useAuthStore } from '@/store/useAuthStore';
import type { MediaAsset } from '@/lib/types';

/**
 * MediaPickerModal
 * ----------------
 * Modal chọn file từ thư viện Media (GET /api/media/assets).
 *  - Props: open, onCancel, onSelect(url), mediaType ('image' | 'video' | 'all').
 *  - Click vào file -> gọi onSelect(asset.originalUrl) và đóng Modal.
 */
export interface MediaPickerModalProps {
  open: boolean;
  onCancel: () => void;
  onSelect: (url: string) => void;
  mediaType?: 'image' | 'video' | 'all';
}

/** Base URL backend để ghép với originalUrl (đường dẫn tương đối /uploads/...). */
const API_BASE = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5088').replace(/\/+$/, '');

/** Ghép URL đầy đủ cho file media. */
function fullUrl(url: string): string {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return `${API_BASE}${url.startsWith('/') ? '' : '/'}${url}`;
}

/** Kiểm tra file có phải ảnh. */
function isImage(mime: string): boolean {
  return mime.startsWith('image/');
}

/** Kiểm tra file có phải video. */
function isVideo(mime: string): boolean {
  return mime.startsWith('video/');
}

export default function MediaPickerModal({
  open,
  onCancel,
  onSelect,
  mediaType = 'image',
}: MediaPickerModalProps) {
  const siteId = useAuthStore((state) => state.siteId);

  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');

  /** Tải danh sách file từ thư viện media. */
  const loadAssets = useCallback(async () => {
    if (!siteId || siteId.trim() === '') return;
    setLoading(true);
    try {
      const res = await api.get<MediaAsset[]>('/api/media/assets', { params: { siteId } });
      setAssets(res.data ?? []);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      message.error(e?.response?.data?.error || 'Không tải được thư viện media');
      setAssets([]);
    } finally {
      setLoading(false);
    }
  }, [siteId]);

  // Chỉ tải khi Modal mở.
  useEffect(() => {
    if (open) loadAssets();
  }, [open, loadAssets]);

  /** Lọc theo mediaType + keyword. */
  const filteredAssets = useMemo(() => {
    let list = assets;
    if (mediaType === 'image') list = list.filter((a) => isImage(a.mimeType));
    else if (mediaType === 'video') list = list.filter((a) => isVideo(a.mimeType));

    const kw = keyword.trim().toLowerCase();
    if (kw) list = list.filter((a) => a.fileName.toLowerCase().includes(kw));
    return list;
  }, [assets, mediaType, keyword]);

  /** Chọn file -> gọi onSelect + đóng. */
  const handleSelect = (asset: MediaAsset) => {
    onSelect(asset.originalUrl);
    onCancel();
  };

  return (
    <Modal
      title={<span className="font-semibold">Chọn file từ thư viện Media</span>}
      open={open}
      onCancel={onCancel}
      footer={null}
      width={800}
      destroyOnHidden
    >
      <div className="mb-4">
        <Space wrap>
          <Input
            placeholder="Tìm tên file..."
            prefix={<SearchOutlined className="text-slate-400" />}
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            allowClear
            style={{ width: 260 }}
            className="rounded-lg"
          />
          <Tag color="blue" className="rounded-md">
            {mediaType === 'image' ? 'Hình ảnh' : mediaType === 'video' ? 'Video' : 'Tất cả file'}
          </Tag>
        </Space>
      </div>

      {loading ? (
        <div className="text-slate-400 text-sm py-12 text-center">Đang tải thư viện...</div>
      ) : filteredAssets.length === 0 ? (
        <Empty description="Chưa có file nào phù hợp" className="py-12" />
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 max-h-[480px] overflow-y-auto pr-1">
          {filteredAssets.map((asset) => (
            <button
              key={asset.id}
              type="button"
              onClick={() => handleSelect(asset)}
              className="group rounded-xl border border-slate-200 overflow-hidden hover:border-blue-400 hover:shadow-md transition-all bg-white text-left"
            >
              <div className="h-24 bg-slate-50 flex items-center justify-center overflow-hidden">
                {isImage(asset.mimeType) ? (
                  <Image
                    src={fullUrl(asset.thumbUrl || asset.originalUrl)}
                    alt={asset.fileName}
                    preview={false}
                    style={{ width: '100%', height: 96, objectFit: 'cover' }}
                  />
                ) : isVideo(asset.mimeType) ? (
                  <VideoCameraOutlined className="text-3xl text-slate-300" />
                ) : (
                  <FileImageOutlined className="text-3xl text-slate-300" />
                )}
              </div>
              <div className="p-2">
                <div className="text-[11px] font-semibold text-slate-700 truncate" title={asset.fileName}>
                  {asset.fileName}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}
