// src/components/Excursions/GooglePlacesInput.jsx
import React, { useEffect, useRef } from "react";

export default function GooglePlacesInput({
  value,
  onSelect,
  onChangeText,
  placeholder,
}) {
  const inputRef = useRef(null);
  const autocompleteRef = useRef(null);

  useEffect(() => {
    const intervalId = setInterval(() => {
      if (!window.google || !inputRef.current) return;

      if (!autocompleteRef.current) {
        autocompleteRef.current = new window.google.maps.places.Autocomplete(
          inputRef.current,
          {
            fields: ["name", "formatted_address", "geometry", "place_id"],
            types: ["establishment", "geocode"],
          }
        );

        autocompleteRef.current.addListener("place_changed", () => {
          const place = autocompleteRef.current.getPlace();
          if (!place || !place.geometry) return;

          const fullAddress =
            place.formatted_address || place.name || "";

          onSelect({
            fullAddress,
            label: place.name || "",
            adresse: fullAddress,
            lat: place.geometry.location.lat(),
            lng: place.geometry.location.lng(),
            place_id: place.place_id,
          });
        });
      }

      clearInterval(intervalId);
    }, 300);

    return () => clearInterval(intervalId);
  }, [onSelect]);

  return (
    <input
      ref={inputRef}
      type="text"
      className="form-control form-control-sm"
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChangeText(e.target.value)}
      autoComplete="off"
    />
  );
}
