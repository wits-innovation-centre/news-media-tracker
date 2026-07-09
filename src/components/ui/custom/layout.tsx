import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Sidebar } from "@/components/ui/custom/sidebar";

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <Sidebar />
      <main className="w-full p-4">
        <SidebarTrigger />
        <div className="mt-4">
          {children}
        </div>
      </main>
    </SidebarProvider>
  )
}

export default Layout;