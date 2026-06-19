"use client";

import React, { useEffect } from "react";
import { useAuthStore } from "@/store/authStore";
import AuthModal from "../auth/AuthModal";

export default function SessionManager() {
  const checkSession = useAuthStore((state) => state.checkSession);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  return <AuthModal />;
}
