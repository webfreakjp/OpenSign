import { Outlet } from "react-router";
import OperatorNotice from "../components/OperatorNotice";

export default function PublicLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <div className="flex-1 min-w-0">
        <Outlet />
      </div>
      <footer className="shrink-0 border-t border-base-300 bg-base-100">
        <OperatorNotice />
      </footer>
    </div>
  );
}
