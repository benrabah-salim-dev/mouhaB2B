// src/components/HotelList.js
import React, { useState, useEffect } from 'react';
import axios from 'axios';

const HotelList = () => {
  const [hotels, setHotels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const API_URL = process.env.REACT_APP_API_URL;

  useEffect(() => {
    const fetchHotels = async () => {
      try {
        const response = await axios.get(`${API_URL}/api/hotels/`);
        setHotels(response.data);
      } catch (err) {
        setError('Erreur lors de la récupération des hôtels');
        console.error('Erreur API:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchHotels();
  }, [API_URL]);

  if (loading) return <p>Chargement des hôtels...</p>;
  if (error) return <p style={{ color: 'red' }}>{error}</p>;

  return (
    <div className="container mt-4">
      <h2>Liste des Hôtels</h2>
      <table className="table table-striped table-bordered">
        <thead>
          <tr>
            <th>#</th>
            <th>Nom de l'Hôtel</th>
            <th>Adresse</th>
            <th>Itinéraire</th>
          </tr>
        </thead>
        <tbody>
          {hotels.map((hotel) => (
            <tr key={hotel.id}>
              <td>{hotel.id}</td>
              <td>{hotel.nom}</td>
              <td>
                {/* Affichage de l'adresse seulement si elle est disponible */}
                {hotel.adresse ? (
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(hotel.adresse)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary"
                  >
                    {hotel.adresse}
                  </a>
                ) : (
                  'Adresse non disponible'
                )}
              </td>
              <td>
                {/* Si l'adresse est disponible, afficher un lien pour l'itinéraire */}
                {hotel.adresse ? (
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(
                      "Votre position ou adresse de départ"  // Remplacer par une adresse de départ dynamique si nécessaire
                    )}&destination=${encodeURIComponent(hotel.adresse)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-sm btn-success"
                  >
                    Créer l'itinéraire
                  </a>
                ) : (
                  'Aucun itinéraire disponible'
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default HotelList;