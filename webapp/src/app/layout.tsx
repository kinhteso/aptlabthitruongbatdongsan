import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PropValue.AI | Lab Thị trường Bất động sản Việt Nam & Định giá Cấp Phường/Xã (34/63 Tỉnh Thành)",
  description:
    "Hệ thống Định giá Tự động BĐS (Hedonic OLS + Heckman 2-Step + LightGBM Quantile + Empirical Bayes Spatial Shrinkage + SHAP), Quét 34/63 Tỉnh Thành & 6 Phân khu Kinh tế (KCN, Làng nghề, Du lịch, CBD, CNC/TOD, Ven đô)",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "PropValue.AI",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#0f172a",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi">
      <body>
        {children}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', () => {
                  navigator.serviceWorker.register('/sw.js').catch(() => {});
                });
              }
            `,
          }}
        />
      </body>
    </html>
  );
}
