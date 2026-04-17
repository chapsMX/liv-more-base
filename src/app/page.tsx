import { Metadata } from "next";
import App from "./app";

export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "LivMore",
    openGraph: {
      title: "LivMore",
      description: "Tracking your healthy habits, one step at a time",
    },
    other: {
      "base:app_id": "6980f8191672d70694e29334",
    },
  };
}

export default function Home() {
  return <App />;
}