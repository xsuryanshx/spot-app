import type { PlaceOption } from "./recommend.js";

const demoPlaces: PlaceOption[] = [
  {
    name: "Chipotle",
    suggestion: "Double chicken bowl, light rice, extra fajita veggies (~45g protein).",
    protein: 45,
    calories: 620
  },
  {
    name: "Sweetgreen",
    suggestion: "Harvest bowl with chicken — high protein, moderate carbs.",
    protein: 38,
    calories: 540
  },
  {
    name: "Cafe nearby",
    suggestion: "Turkey avocado wrap, skip sugary drink.",
    protein: 32,
    calories: 480
  }
];

export async function nearbyFoodOptions(
  location?: { latitude: number; longitude: number }
): Promise<PlaceOption[]> {
  if (!location) return [];

  if (process.env.SPOT_DEMO_MODE === "1" || !process.env.GOOGLE_PLACES_API_KEY) {
    return demoPlaces;
  }

  const url = new URL("https://maps.googleapis.com/maps/api/place/nearbysearch/json");
  url.searchParams.set("key", process.env.GOOGLE_PLACES_API_KEY);
  url.searchParams.set("location", `${location.latitude},${location.longitude}`);
  url.searchParams.set("radius", "1500");
  url.searchParams.set("type", "restaurant");
  url.searchParams.set("keyword", "healthy high protein");

  const response = await fetch(url);
  if (!response.ok) return demoPlaces;

  const payload = (await response.json()) as {
    results?: Array<{ name?: string }>;
  };

  const names = payload.results?.slice(0, 3).map((place) => place.name).filter(Boolean) as string[];
  if (!names?.length) return demoPlaces;

  return names.map((name, index) => ({
    ...demoPlaces[index % demoPlaces.length],
    name
  }));
}
