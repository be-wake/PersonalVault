import { Redirect } from 'expo-router';
import { useAuth } from '@/src/lib/auth';
import LoadingSpinner from '@/src/components/LoadingSpinner';

export default function Index() {
  const { user, isLoading } = useAuth();

  if (isLoading) return <LoadingSpinner message="Loading…" />;
  if (user) return <Redirect href="/(app)/dashboard" />;
  return <Redirect href="/(auth)/sign-in" />;
}
