import AdminPanel from "../panel";

export const metadata = {
  title: "Telegram Bot | Admin | AO Photography",
  robots: { index: false, follow: false },
};

export default function TelegramAdminPage() {
  return <AdminPanel section="telegram" />;
}
