import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, getUserFacingErrorMessage } from "@/api/errors";
import { getBusiness, updateBusiness } from "@/api/businesses";
import { useAuth } from "@/auth";
import { useBusiness } from "@/business";
import {
  AuthScreen,
  FormButton,
  FormField,
  FormMessage,
} from "@/components/AuthScreen";
import { appHref } from "@/navigation/hrefs";
import { businessProfileFormSchema } from "@/validation/business";

interface FieldErrors {
  name?: string;
  email?: string;
  phone?: string;
  address?: string;
  receiptFooter?: string;
}

export default function BusinessSettingsScreen() {
  const router = useRouter();
  const { accessToken, logout } = useAuth();
  const { currentBusiness } = useBusiness();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [receiptFooter, setReceiptFooter] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<{
    type: "error" | "success";
    text: string;
  }>();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const isDirtyRef = useRef(false);
  const nameRef = useRef("");
  const emailRef = useRef("");
  const phoneRef = useRef("");
  const addressRef = useRef("");
  const receiptFooterRef = useRef("");
  const logoutRef = useRef(logout);
  const routerRef = useRef(router);

  useEffect(() => {
    logoutRef.current = logout;
    routerRef.current = router;
  }, [logout, router]);

  const businessId = currentBusiness?.id;
  const canEdit =
    currentBusiness?.role === "owner" || currentBusiness?.role === "admin";

  const loadProfile = useCallback(async () => {
    if (!accessToken || !businessId) {
      return;
    }

    setIsLoading(true);
    setMessage(undefined);

    try {
      const business = await getBusiness(accessToken, businessId);
      if (!isDirtyRef.current) {
        const loadedPhone = business.phone ?? "";
        const loadedAddress = business.address ?? "";
        const loadedFooter = business.receiptFooter ?? "";
        nameRef.current = business.name;
        emailRef.current = business.email ?? "";
        phoneRef.current = loadedPhone;
        addressRef.current = loadedAddress;
        receiptFooterRef.current = loadedFooter;
        setName(business.name);
        setEmail(business.email ?? "");
        setPhone(loadedPhone);
        setAddress(loadedAddress);
        setReceiptFooter(loadedFooter);
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await logoutRef.current();
        routerRef.current.replace("/(auth)/login");
        return;
      }

      setMessage({ type: "error", text: getUserFacingErrorMessage(error) });
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, businessId]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const saveProfile = async () => {
    if (!accessToken || !businessId || !canEdit || isSaving) {
      return;
    }

    setFieldErrors({});
    setMessage(undefined);

    const parsed = businessProfileFormSchema.safeParse({
      name: nameRef.current,
      email: emailRef.current,
      phone: phoneRef.current,
      address: addressRef.current,
      receiptFooter: receiptFooterRef.current,
    });

    if (!parsed.success) {
      const nextErrors: FieldErrors = {};
      const formIssue = parsed.error.issues.find(
        (issue) => issue.path.length === 0,
      );
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (typeof field === "string" && !(field in nextErrors)) {
          nextErrors[field as keyof FieldErrors] = issue.message;
        }
      }
      setFieldErrors(nextErrors);
      if (formIssue) {
        setMessage({ type: "error", text: formIssue.message });
      }
      return;
    }

    setIsSaving(true);

    try {
      const updatedBusiness = await updateBusiness(accessToken, businessId, {
        name: parsed.data.name,
        email: parsed.data.email,
        phone: parsed.data.phone || null,
        address: parsed.data.address || null,
        receiptFooter: parsed.data.receiptFooter || null,
      });
      setName(updatedBusiness.name);
      setEmail(updatedBusiness.email ?? "");
      setPhone(updatedBusiness.phone ?? "");
      setAddress(updatedBusiness.address ?? "");
      setReceiptFooter(updatedBusiness.receiptFooter ?? "");
      nameRef.current = updatedBusiness.name;
      emailRef.current = updatedBusiness.email ?? "";
      phoneRef.current = updatedBusiness.phone ?? "";
      addressRef.current = updatedBusiness.address ?? "";
      receiptFooterRef.current = updatedBusiness.receiptFooter ?? "";
      isDirtyRef.current = false;
      setMessage({ type: "success", text: "Business profile saved." });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await logout();
        router.replace("/(auth)/login");
        return;
      }

      setMessage({ type: "error", text: getUserFacingErrorMessage(error) });
    } finally {
      setIsSaving(false);
    }
  };

  if (!canEdit && !isLoading) {
    return (
      <AuthScreen title="Business Settings">
        <FormMessage message="Only owners and admins can edit business settings." />
        <FormButton label="Back" onPress={() => router.replace(appHref)} />
      </AuthScreen>
    );
  }

  const completedProfileFields = [phone, address, receiptFooter].filter(
    (value) => value.trim().length > 0,
  ).length;

  return (
    <AuthScreen
      title="Business & Receipt Settings"
      subtitle="These details appear on printed and shared receipts. Currency remains SLE."
      isLoading={isLoading || isSaving}
    >
      <FormMessage message={message?.text} type={message?.type} />
      <FormField
        label="Business Name"
        value={name}
        onChangeText={(value) => {
          isDirtyRef.current = true;
          nameRef.current = value;
          setName(value);
        }}
        autoCapitalize="words"
        error={fieldErrors.name}
      />
      <FormField
        label="Business Email"
        value={email}
        onChangeText={(value) => {
          isDirtyRef.current = true;
          emailRef.current = value;
          setEmail(value);
        }}
        keyboardType="email-address"
        autoCapitalize="none"
        error={fieldErrors.email}
      />
      <FormField
        label="Phone"
        value={phone}
        onChangeText={(value) => {
          isDirtyRef.current = true;
          phoneRef.current = value;
          setPhone(value);
        }}
        keyboardType="phone-pad"
        placeholder="+232 76 000 000"
        error={fieldErrors.phone}
      />
      <FormField
        label="Address"
        value={address}
        onChangeText={(value) => {
          isDirtyRef.current = true;
          addressRef.current = value;
          setAddress(value);
        }}
        multiline
        placeholder="Street, town or district"
        error={fieldErrors.address}
      />
      <FormField
        label="Receipt Footer"
        value={receiptFooter}
        onChangeText={(value) => {
          isDirtyRef.current = true;
          receiptFooterRef.current = value;
          setReceiptFooter(value);
        }}
        multiline
        placeholder="Thank you for your business."
        error={fieldErrors.receiptFooter}
      />
      <FormMessage
        type={completedProfileFields > 0 ? "success" : "error"}
        message={
          completedProfileFields > 0
            ? `${completedProfileFields} receipt profile field${completedProfileFields === 1 ? " is" : "s are"} ready to save.`
            : "Enter at least one receipt profile field before saving."
        }
      />
      <FormButton
        label="Save Settings"
        disabled={isLoading || isSaving}
        onPress={() => void saveProfile()}
      />
      <FormButton
        label="Back"
        variant="secondary"
        disabled={isSaving}
        onPress={() => router.replace(appHref)}
      />
    </AuthScreen>
  );
}
