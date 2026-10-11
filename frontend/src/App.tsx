import { Routes, Route } from "react-router-dom";
import { RequireAuth } from "./auth/RequireAuth";
import { AppShell } from "./components/AppShell";
import { HomePage } from "./features/home/HomePage";
import { LoginPage } from "./features/auth/LoginPage";
import { RegisterPage } from "./features/auth/RegisterPage";
import { CompanyCreatePage } from "./features/companies/CompanyCreatePage";
import { CompanyListPage } from "./features/companies/CompanyListPage";
import { OnboardingPage } from "./features/onboarding/OnboardingPage";
import { DocumentListPage } from "./features/documents/DocumentListPage";
import { DocumentEditorPage } from "./features/documents/DocumentEditorPage";
import { MarcheListPage } from "./features/marches/MarcheListPage";
import { MarcheDetailPage } from "./features/marches/MarcheDetailPage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          <Route path="/documents" element={<DocumentListPage />} />
          <Route path="/companies" element={<CompanyListPage />} />
          <Route path="/company/new" element={<CompanyCreatePage />} />
          <Route path="/onboarding/:companyId" element={<OnboardingPage />} />
          <Route path="/documents/new" element={<DocumentEditorPage />} />
          <Route path="/documents/:id" element={<DocumentEditorPage />} />
          <Route path="/marches" element={<MarcheListPage />} />
          <Route path="/marches/new" element={<MarcheDetailPage />} />
          <Route path="/marches/:id" element={<MarcheDetailPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
