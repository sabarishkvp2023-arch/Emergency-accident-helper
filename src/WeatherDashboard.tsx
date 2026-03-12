import React, { useState, useEffect } from 'react';

const WeatherDashboard = () => {
    const [location, setLocation] = useState('New York');
    const [weatherData, setWeatherData] = useState(null);
    const [forecastData, setForecastData] = useState(null);
    const [units, setUnits] = useState('metric'); // 'metric' for Celsius, 'imperial' for Fahrenheit
    const [alerts, setAlerts] = useState([]);

    const apiKey = 'YOUR_OPENWEATHERMAP_API_KEY'; // Replace with your OpenWeatherMap API key

    const fetchWeatherData = async () => {
        const res = await fetch(`https://api.openweathermap.org/data/2.5/weather?q=${location}&units=${units}&appid=${apiKey}`);
        const data = await res.json();
        setWeatherData(data);
    };

    const fetchForecastData = async () => {
        const res = await fetch(`https://api.openweathermap.org/data/2.5/forecast?q=${location}&units=${units}&appid=${apiKey}`);
        const data = await res.json();
        setForecastData(data);
    };

    const fetchWeatherAlerts = async () => {
        const res = await fetch(`https://api.openweathermap.org/data/2.5/alerts?q=${location}&appid=${apiKey}`);
        const data = await res.json();
        setAlerts(data);
    };

    useEffect(() => {
        fetchWeatherData();
        fetchForecastData();
        fetchWeatherAlerts();
    }, [location, units]);

    return (
        <div>
            <h1>Weather Dashboard</h1>
            <input 
                type="text" 
                value={location} 
                onChange={(e) => setLocation(e.target.value)} 
                placeholder="Enter location"
            />
            <button onClick={fetchWeatherData}>Search</button>
            <button onClick={() => setUnits(units === 'metric' ? 'imperial' : 'metric')}>Toggle Temperature Unit</button>

            {weatherData && (
                <div>
                    <h2>Current Weather in {weatherData.name}</h2>
                    <p>{weatherData.weather[0].description}</p>
                    <p>Temperature: {weatherData.main.temp}°</p>
                </div>
            )}

            {forecastData && (
                <div>
                    <h2>5-Day Forecast</h2>
                    {forecastData.list.map((item, index) => (
                        <div key={index}>
                            <p>{item.dt_txt}: {item.main.temp}° - {item.weather[0].description}</p>
                        </div>
                    ))}
                </div>
            )}

            {alerts.length > 0 && (
                <div>
                    <h2>Weather Alerts</h2>
                    {alerts.map((alert, index) => (
                        <div key={index}>
                            <p>{alert.description}</p>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default WeatherDashboard;